import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Copy, MessageCircle, CheckCircle2, Circle, Award, ExternalLink, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-hidden';
const ROLES: [string, string, string][] = [
  ['BROKER', 'Broker', 'ब्रोकर'], ['DEVELOPER_BUILDER', 'Builder / Developer', 'बिल्डर / डेवलपर'], ['CONTRACTOR', 'Contractor', 'ठेकेदार'],
  ['LEGAL_COUNSEL', 'Legal counsel', 'वकील'], ['PROPERTY_OWNER', 'Property owner', 'प्रॉपर्टी मालिक'],
];
const STATUS_STYLE: Record<string, string> = { NEW: 'bg-amber-100 text-amber-800', INVITED: 'bg-sky-100 text-sky-800', JOINED: 'bg-emerald-100 text-emerald-800', REJECTED: 'bg-slate-200 text-slate-600' };

/** "Grow the network": personal invite code, nominations, badges, activation checklist and the public visiting card. */
export const GrowthView: React.FC = () => {
  const tx = useTx();
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [f, setF] = useState({ name: '', phone: '', city: '', role: 'BROKER', note: '', consent: false });
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState({ enabled: false, showPhone: false, headline: '' });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    try { const r = await api.growthMe(); setD(r); setCard({ enabled: r.card.enabled, showPhone: r.card.showPhone, headline: r.card.headline }); }
    catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <p className="text-sm text-red-700">{err}</p>;
  if (!d) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;

  const link = `${origin}/?ref=${d.code}`;
  const text = (hi ? d.shareText.hi : d.shareText.en).replace('{link}', link);
  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => setMsg({ ok: true, text: tx('Copied', 'कॉपी हो गया') })).catch(() => {}); };
  const nominate = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await api.growthNominate(f); setF({ name: '', phone: '', city: '', role: 'BROKER', note: '', consent: false }); setMsg({ ok: true, text: tx('Nominated. GENZ will review and send the invitation.', 'नामांकित हो गया। GENZ जाँचकर इनवाइट भेजेगा।') }); await load(); }
    catch (e2: any) { setMsg({ ok: false, text: e2.message }); } finally { setBusy(false); }
  };
  const saveCard = async (next: typeof card) => {
    setCard(next);
    try { await api.growthCard(next); setMsg({ ok: true, text: tx('Card updated', 'कार्ड अपडेट हो गया') }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };
  const roleLabel = (r: string) => { const x = ROLES.find(v => v[0] === r); return x ? (hi ? x[2] : x[1]) : r; };
  const b = d.badges;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{tx('Grow your network', 'अपना नेटवर्क बढ़ाएँ')}</h2>
        <p className="text-xs text-slate-500">{tx('GENZ stays invite-only. Bring in people you trust — the stronger your city, the more deals for everyone.', 'GENZ इनवाइट-ओनली रहता है। जिन पर भरोसा है उन्हें जोड़ें — शहर जितना मज़बूत, सबके लिए उतने सौदे।')}</p>
      </div>
      {msg && <div className={`rounded-lg p-2.5 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <div className="rounded-2xl bg-slate-900 p-5 text-white">
        <div className="text-xs opacity-70">{tx('Your personal invite code', 'आपका पर्सनल इनवाइट कोड')}</div>
        <div className="mt-1 font-mono text-2xl font-bold tracking-wider text-amber-300">{d.code}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white"><MessageCircle className="h-4 w-4" /> {tx('Share on WhatsApp', 'WhatsApp पर भेजें')}</a>
          <button onClick={() => copy(text)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-2 text-xs font-semibold"><Copy className="h-4 w-4" /> {tx('Copy message', 'संदेश कॉपी करें')}</button>
        </div>
        <p className="mt-2 text-[11px] opacity-70">{tx('Anyone who requests access with your code lands in your pipeline below. GENZ ops approves every request — nobody joins without KYC.', 'आपके कोड से एक्सेस माँगने वाला नीचे आपकी पाइपलाइन में आता है। हर रिक्वेस्ट GENZ ऑप्स मंज़ूर करता है — KYC के बिना कोई नहीं जुड़ता।')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([[tx('Nominated', 'नामांकित'), d.stats.nominated], [tx('Waiting for review', 'समीक्षा में'), d.stats.pending], [tx('Joined', 'जुड़े'), d.stats.joined], [tx('Verified', 'सत्यापित'), d.stats.verified]] as [string, number][]).map(([l, n]) => (
          <div key={l} className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-2xl font-bold text-slate-900">{n}</div><div className="text-[11px] text-slate-500">{l}</div></div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Award className="h-4 w-4 text-amber-500" /> {tx('Badges', 'बैज')}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {b.earned.length === 0 && <span className="text-xs text-slate-500">{tx('Get your first nominee verified to earn “Network Starter”.', 'पहला नामांकित सत्यापित होते ही “नेटवर्क स्टार्टर” बैज मिलेगा।')}</span>}
          {b.earned.map((x: any) => <span key={x.id} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">🏅 {hi ? x.hi : x.en}</span>)}
        </div>
        {b.next && <p className="mt-2 text-[11px] text-slate-500">{tx(`${b.next.remaining} more verified member(s) for “${b.next.en}”.`, `“${b.next.hi}” के लिए ${b.next.remaining} और सत्यापित सदस्य चाहिए।`)}</p>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm font-bold text-slate-900"><span>{tx('Get started', 'शुरुआत करें')}</span><span className="text-xs font-semibold text-emerald-700">{d.progress}%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${d.progress}%` }} /></div>
        <ul className="mt-3 space-y-1.5">
          {d.checklist.map((c: any) => (
            <li key={c.id} className={`flex items-center gap-2 text-xs ${c.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
              {c.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-slate-300" />}{hi ? c.hi : c.en}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={nominate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Users className="h-4 w-4" /> {tx('Nominate someone you trust', 'किसी भरोसेमंद को नामांकित करें')}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={tx('Full name', 'पूरा नाम')} className={input} />
          <input required inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder={tx('Mobile number', 'मोबाइल नंबर')} className={input} />
          <input required value={f.city} onChange={e => setF({ ...f, city: e.target.value })} placeholder={tx('City', 'शहर')} className={input} />
          <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} className={input}>{ROLES.map(r => <option key={r[0]} value={r[0]}>{hi ? r[2] : r[1]}</option>)}</select>
        </div>
        <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder={tx('Why do you recommend them? (optional)', 'आप उन्हें क्यों सुझा रहे हैं? (वैकल्पिक)')} className={input} />
        <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" required checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} className="mt-0.5 h-4 w-4" />{tx('This person knows I am nominating them and agreed that GENZ may contact them.', 'इस व्यक्ति को पता है कि मैं उन्हें नामांकित कर रहा/रही हूँ और वे GENZ के संपर्क के लिए सहमत हैं।')}</label>
        <button disabled={busy || !f.consent} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-amber-300 disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Nominate', 'नामांकित करें')}</button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-bold text-slate-900">{tx('Public visiting card', 'पब्लिक विज़िटिंग कार्ड')}</div>
        <p className="mt-1 text-xs text-slate-500">{tx('A shareable page with your verified status and brand — put it on your WhatsApp status or visiting card. Nothing is shown unless you switch it on.', 'आपके सत्यापित स्टेटस और ब्रांड वाला शेयर करने योग्य पेज — WhatsApp स्टेटस या विज़िटिंग कार्ड पर लगाएँ। आप चालू करें तभी कुछ दिखता है।')}</p>
        <div className="mt-3 space-y-2 text-xs">
          <label className="flex items-center gap-2"><input type="checkbox" checked={card.enabled} onChange={e => saveCard({ ...card, enabled: e.target.checked })} className="h-4 w-4" />{tx('Card is live', 'कार्ड चालू है')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={card.showPhone} disabled={!card.enabled} onChange={e => saveCard({ ...card, showPhone: e.target.checked })} className="h-4 w-4" />{tx('Show my Call / WhatsApp buttons', 'मेरे कॉल / WhatsApp बटन दिखाएँ')}</label>
          <div className="flex gap-2"><input value={card.headline} maxLength={120} onChange={e => setCard({ ...card, headline: e.target.value })} placeholder={tx('One-line headline (optional)', 'एक-लाइन हेडलाइन (वैकल्पिक)')} className={input} /><button onClick={() => saveCard(card)} className="rounded-lg border border-slate-300 px-3 text-xs font-semibold">{tx('Save', 'सेव')}</button></div>
        </div>
        {card.enabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <code className="rounded bg-slate-100 px-2 py-1">{origin}{d.card.path}</code>
            <button onClick={() => copy(`${origin}${d.card.path}`)} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 font-semibold"><Copy className="h-3.5 w-3.5" /> {tx('Copy', 'कॉपी')}</button>
            <a href={d.card.path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 font-semibold"><ExternalLink className="h-3.5 w-3.5" /> {tx('Preview', 'देखें')}</a>
            <span className="text-slate-500">{tx(`${d.card.views} views`, `${d.card.views} व्यू`)}</span>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-bold text-slate-900">{tx('Your pipeline', 'आपकी पाइपलाइन')}</div>
        {d.pipeline.length === 0 ? <p className="mt-2 text-xs text-slate-500">{tx('Nobody yet. Share your code or nominate someone above.', 'अभी कोई नहीं। अपना कोड शेयर करें या ऊपर किसी को नामांकित करें।')}</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500"><tr>{[tx('Name', 'नाम'), tx('Role', 'भूमिका'), tx('City', 'शहर'), tx('Status', 'स्थिति')].map(h => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{d.pipeline.map((l: any) => (
                <tr key={l.id} className="border-t border-slate-100"><td className="py-1.5 pr-3 font-medium text-slate-900">{l.name}</td><td className="pr-3">{roleLabel(l.role)}</td><td className="pr-3">{l.city}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[l.status]}`}>{({ NEW: tx('In review', 'समीक्षा में'), INVITED: tx('Invited', 'इनवाइट भेजा'), JOINED: tx('Joined', 'जुड़ गए'), REJECTED: tx('Not taken forward', 'आगे नहीं बढ़ा') } as Record<string, string>)[l.status]}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
