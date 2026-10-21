import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageCircle, Rocket } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { STAGE_LABEL, type CityStage } from '../shared/cities.js';

const STAGE_STYLE: Record<CityStage, string> = { WAITLIST: 'bg-slate-100 text-slate-600', SEEDING: 'bg-amber-100 text-amber-800', LIVE: 'bg-emerald-100 text-emerald-800', HUB: 'bg-indigo-100 text-indigo-800' };
const small = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs';

/** Ops view: where the network is strong, where demand is waiting, which city to open next. */
export const CityLaunch: React.FC<{ canReset: boolean }> = ({ canReset }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const [board, setBoard] = useState<any>(null);
  const [queue, setQueue] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [out, setOut] = useState<{ title: string; text: string; phone: string } | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try { const [b, q] = await Promise.all([api.growthCities(), api.growthQueue('NEW')]); setBoard(b); setQueue(q); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<any>, ok: string, after?: (r: any) => void) => {
    try { const r = await fn(); setMsg({ ok: true, text: ok }); after?.(r); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  if (!board || !queue) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const s = board.summary;
  const th = board.thresholds;
  const cities = board.cities.filter((c: any) => !filter || c.city.toLowerCase().includes(filter.toLowerCase()));
  const waLink = (phone: string, text: string) => `https://wa.me/91${String(phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{tx('City launch board', 'सिटी लॉन्च बोर्ड')}</h2>
        <p className="text-xs text-slate-500">{tx(`A city is Seeding at ${th.SEEDING}, Live at ${th.LIVE} and a Hub at ${th.HUB} verified professionals.`, `शहर ${th.SEEDING} सत्यापित प्रोफ़ेशनल पर शुरुआती, ${th.LIVE} पर लाइव और ${th.HUB} पर हब बनता है।`)}</p>
      </div>
      {msg && <div className={`rounded-lg p-2.5 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      {out && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs">
          <div className="font-semibold text-emerald-900">{out.title}</div>
          <pre className="mt-2 whitespace-pre-wrap rounded bg-white p-2 text-[11px] text-slate-800">{out.text}</pre>
          <div className="mt-2 flex gap-2">
            <a href={waLink(out.phone, out.text)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
            <button onClick={() => setOut(null)} className={small}>{tx('Done', 'हो गया')}</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([[tx('Verified professionals', 'सत्यापित प्रोफ़ेशनल'), s.verifiedPros], [tx('Cities live / hub', 'लाइव / हब शहर'), s.citiesLive], [tx('Waiting for review', 'समीक्षा में'), s.waitlistOpen], [tx('Invites per member', 'प्रति सदस्य इनवाइट'), s.invitesPerMember]] as [string, number][]).map(([l, n]) => (
          <div key={l} className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-2xl font-bold text-slate-900">{n}</div><div className="text-[11px] text-slate-500">{l}</div></div>
        ))}
      </div>
      {board.nextCity && (
        <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-900">
          <Rocket className="mt-0.5 h-5 w-5 shrink-0" />
          <div><b>{tx('Open next:', 'अगला शहर खोलें:')} {board.nextCity.city}</b> — {tx(`${board.nextCity.waitlist} people waiting, ${board.nextCity.pendingKyc} KYC pending. Approve their requests below, then ask 2–3 trusted local brokers to nominate peers.`, `${board.nextCity.waitlist} लोग इंतज़ार में, ${board.nextCity.pendingKyc} KYC बाकी। नीचे उनकी रिक्वेस्ट मंज़ूर करें, फिर 2–3 भरोसेमंद लोकल ब्रोकर से साथियों को नामांकित करवाएँ।`)}</div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-bold text-slate-900">{tx('Requests & nominations', 'रिक्वेस्ट और नामांकन')} ({queue.leads.length})</h3>
        {queue.leads.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">{tx('Nothing waiting.', 'कुछ बाकी नहीं।')}</p> : (
          <div className="space-y-2">
            {queue.leads.map((l: any) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <div><b className="text-slate-900">{l.name}</b> · {l.role.replace('_', ' ')} · {l.city} · {l.phone}<div className="text-slate-500">{l.source === 'NOMINATION' && l.nominatorName ? tx(`Nominated by ${l.nominatorName}`, `${l.nominatorName} द्वारा नामांकित`) : tx('Public request', 'पब्लिक रिक्वेस्ट')}{l.note ? ` — “${l.note}”` : ''}</div></div>
                <div className="flex gap-2">
                  <button onClick={() => act(() => api.growthApprove(l.id), tx('Invitation issued', 'इनवाइट जारी हुआ'), r => setOut({ title: tx(`Invitation for ${l.name} — send it on WhatsApp`, `${l.name} का इनवाइट — WhatsApp पर भेजें`), text: r.whatsappText, phone: l.phone }))} className={small + ' font-semibold text-emerald-700'}>{tx('Approve & invite', 'मंज़ूर करें')}</button>
                  <button onClick={() => { const reason = window.prompt(tx('Reason (optional)', 'कारण (वैकल्पिक)')) ?? undefined; if (reason !== undefined) act(() => api.growthReject(l.id, reason), tx('Rejected', 'अस्वीकृत')); }} className={small}>{tx('Reject', 'अस्वीकार')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canReset && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-900">{tx('Forgot-password requests', 'पासवर्ड भूलने की रिक्वेस्ट')} ({queue.resets.length})</h3>
          {queue.resets.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">{tx('None.', 'कोई नहीं।')}</p> : (
            <div className="space-y-2">
              {queue.resets.map((x: any) => (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                  <div><b className="text-slate-900">{x.userName || tx('Unknown / several accounts', 'अज्ञात / कई खाते')}</b> {x.userRole ? `· ${x.userRole.replace('_', ' ')}` : ''} · {x.phone}</div>
                  <div className="flex gap-2">
                    <button disabled={!x.userId} onClick={() => act(() => api.growthResetIssue(x.id), tx('Temporary password issued', 'अस्थायी पासवर्ड जारी हुआ'), r => setOut({ title: tx(`New password for ${r.name} — shown once`, `${r.name} का नया पासवर्ड — सिर्फ़ एक बार`), text: r.whatsappText, phone: x.phone }))} className={small + ' font-semibold disabled:opacity-40'}>{tx('Issue password', 'पासवर्ड जारी करें')}</button>
                    <button onClick={() => act(() => api.growthResetDismiss(x.id), tx('Dismissed', 'हटा दिया'))} className={small}>{tx('Dismiss', 'हटाएँ')}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">{tx('Cities', 'शहर')}</h3>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={tx('Search city', 'शहर खोजें')} className={small + ' w-40'} />
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>{[tx('City', 'शहर'), tx('Stage', 'चरण'), tx('Verified', 'सत्यापित'), 'B / D / C / L', tx('KYC pending', 'KYC बाकी'), tx('Waiting', 'इंतज़ार'), tx('Listings', 'लिस्टिंग'), tx('Deals', 'डील')].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{cities.map((c: any) => (
              <tr key={c.city} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold text-slate-900">{c.city}{c.state ? <span className="ml-1 font-normal text-slate-400">{c.state}</span> : null}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_STYLE[c.stage as CityStage]}`}>{hi ? STAGE_LABEL[c.stage as CityStage].hi : STAGE_LABEL[c.stage as CityStage].en}</span></td>
                <td className="px-3 py-2 font-semibold">{c.verifiedPros}</td><td className="px-3 py-2 text-slate-500">{c.brokers} / {c.builders} / {c.contractors} / {c.legal}</td>
                <td className="px-3 py-2">{c.pendingKyc}</td><td className="px-3 py-2">{c.waitlist}</td><td className="px-3 py-2">{c.listings}</td><td className="px-3 py-2">{c.deals}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {board.topInviters.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-900">{tx('Top inviters', 'टॉप इनवाइटर')}</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-xs">
            {board.topInviters.map((i: any) => <div key={i.id} className="flex justify-between border-b border-slate-100 px-3 py-2 last:border-0"><span><b>{i.name}</b> · {i.city}</span><span>{tx(`${i.verified} verified of ${i.joined} joined`, `${i.joined} में से ${i.verified} सत्यापित`)}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
};
