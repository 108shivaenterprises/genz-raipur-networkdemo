import React, { useCallback, useEffect, useState } from 'react';
import { Copy, ExternalLink, FileText, Link2, Loader2, MessageCircle, Send, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { Sheet, Err, useBusy, inp, btnDark, btnLine } from './CrmPlus.js';
import { Chip, Tog, copyText, siteUrl } from './InventorySheets.js';

/**
 * v77 — "Project papers": brochures, price lists, payment plans the builder gave a partner.
 *   · a paper given to ME personally says so
 *   · a broker can show papers to his team (whole team or named staff) and decide if the team may send them to clients
 *   · whoever is allowed sends a tracked client page (/s/<token>) — it stops working the moment the builder pulls the paper
 */
interface Props { role: string; projectId?: string; refreshKey?: number }

const KIND_WORD: Record<string, [string, string]> = { BROCHURE: ['Brochure', 'ब्रोशर'], PRICE_LIST: ['Price list', 'प्राइस लिस्ट'], PAYMENT_PLAN: ['Payment plan', 'पेमेंट प्लान'], RERA: ['RERA paper', 'RERA काग़ज़'], LAYOUT: ['Layout', 'लेआउट'], OTHER: ['Other', 'अन्य'] };
const ago = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—');

// ───────────────────────── show to my team ─────────────────────────
const TeamSheet: React.FC<{ docs: any[]; firstId: string; team: any[]; onClose: () => void; onDone: (m: string) => void }> = ({ docs, firstId, team, onClose, onDone }) => {
  const tx = useTx();
  const projectId = docs.find(d => d.id === firstId)?.projectId;
  const same = docs.filter(d => d.projectId === projectId && d.canTeam);
  const [ids, setIds] = useState<string[]>([firstId]);
  const [who, setWho] = useState<string[]>([]);
  const [client, setClient] = useState(false);
  const [note, setNote] = useState('');
  const { busy, err, go } = useBusy();
  const picked = same.filter(d => ids.includes(d.id));
  const clientOk = picked.length > 0 && picked.every(d => d.canClient);
  const target = (who.length ? team.filter(m => who.includes(m.id)) : team).filter(m => m.canSee);
  const noSenders = client && target.length > 0 && target.every(m => !m.canSend);
  return (
    <Sheet title={tx('Show papers to my team', 'काग़ज़ मेरी टीम को दिखाएँ')} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div>
          <div className="mb-1 font-semibold text-slate-700">{tx('Which papers', 'कौन-से काग़ज़')}</div>
          <div className="space-y-1">
            {same.map(d => (
              <label key={d.id} className="flex min-h-9 items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={ids.includes(d.id)} onChange={e => setIds(e.target.checked ? [...ids, d.id] : ids.filter(x => x !== d.id))} /><span className="min-w-0 truncate">{d.title}</span></label>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 font-semibold text-slate-700">{tx('Who', 'किसे')}</div>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={who.length === 0} onClick={() => setWho([])}><Users className="mr-1 inline h-3 w-3" />{tx('Whole team', 'पूरी टीम')}</Chip>
            {team.map(m => <Chip key={m.id} disabled={!m.canSee} on={who.includes(m.id)} onClick={() => setWho(who.includes(m.id) ? who.filter(x => x !== m.id) : [...who, m.id])}>{m.name}{m.title ? ` · ${m.title}` : ''}</Chip>)}
          </div>
          {team.length === 0 && <p className="mt-1 text-slate-500">{tx('No verified team member yet.', 'अभी कोई वेरिफ़ाइड टीम सदस्य नहीं।')}</p>}
          {team.some(m => !m.canSee) && <p className="mt-1 text-[10px] text-slate-500">{tx('Greyed-out people have unit access switched off — turn it on in Team first.', 'धूसर नाम वालों की यूनिट एक्सेस बंद है — पहले Team में चालू करें।')}</p>}
        </div>
        <div className="rounded-lg border border-slate-200 p-2">
          <Tog on={client && clientOk} onChange={setClient} disabled={!clientOk} label={tx('Team may send these to clients and customers', 'टीम इन्हें क्लाइंट और ग्राहक को भेज सकती है')}
            hint={clientOk ? tx('They get a tracked page — you see how many times it was opened. Staff also need “Customer link” switched on.', 'उन्हें ट्रैक होने वाला पेज मिलता है — कितनी बार खुला, आप देखते हैं। स्टाफ़ के लिए “कस्टमर लिंक” भी चालू होना चाहिए।') : tx('The builder allows only your team to read at least one of these — not to send it on.', 'बिल्डर ने इनमें से कम से कम एक काग़ज़ सिर्फ़ आपकी टीम के पढ़ने के लिए रखा है — आगे भेजने के लिए नहीं।')} />
          {noSenders && <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">{tx('None of these people can send customer links yet — switch on “Customer link” for them in Team.', 'इनमें से कोई अभी कस्टमर लिंक नहीं भेज सकता — Team में उनके लिए “कस्टमर लिंक” चालू करें।')}</p>}
        </div>
        <input value={note} onChange={e => setNote(e.target.value.slice(0, 200))} placeholder={tx('Note for the team (optional)', 'टीम के लिए नोट (वैकल्पिक)')} className={inp} />
        <Err msg={err} />
        <button type="button" disabled={busy || picked.length === 0} data-testid="docpost-submit" className={`${btnDark} w-full`}
          onClick={() => go(() => api.projDocPost({ projectId, docIds: picked.map(d => d.id), memberIds: who, allowClient: client && clientOk, note }), () => onDone(tx('Your team can now see these papers', 'आपकी टीम अब ये काग़ज़ देख सकती है')))}>
          <Send className="h-4 w-4" />{tx('Show to team', 'टीम को दिखाएँ')}
        </button>
      </div>
    </Sheet>
  );
};

// ───────────────────────── send to a client ─────────────────────────
const ClientSheet: React.FC<{ doc: any; onClose: () => void; onDone: () => void }> = ({ doc, onClose, onDone }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const [label, setLabel] = useState('');
  const [l, setL] = useState<'en' | 'hi'>(lang === 'hi' ? 'hi' : 'en');
  const [url, setUrl] = useState('');
  const [flash, setFlash] = useState('');
  const { busy, err, go } = useBusy();
  const hiL = l === 'hi';
  const text = hiL
    ? `नमस्ते${label ? ` ${label}` : ''}, *${doc.projectName}* का "${doc.title}" यहाँ देखें: ${url}`
    : `Hello${label ? ` ${label}` : ''}, here is "${doc.title}" for *${doc.projectName}*: ${url}`;
  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2200); };
  return (
    <Sheet title={tx('Send to a client', 'क्लाइंट को भेजें')} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div className="rounded-lg bg-slate-50 p-2"><b className="block text-slate-900">{doc.title}</b><span className="text-slate-600">{doc.projectName}</span></div>
        {!url && (
          <>
            <input value={label} onChange={e => setLabel(e.target.value.slice(0, 60))} placeholder={tx('Client name (only for you, optional)', 'क्लाइंट का नाम (सिर्फ़ आपके लिए, वैकल्पिक)')} className={inp} data-testid="docshare-label" />
            <div className="grid grid-cols-2 gap-1.5">{(['en', 'hi'] as const).map(k => <button key={k} type="button" onClick={() => setL(k)} className={`min-h-9 rounded-lg text-[11px] font-semibold ${l === k ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white'}`}>{k === 'en' ? 'English' : 'हिन्दी'}</button>)}</div>
            <p className="text-[10px] text-slate-500">{tx('The client opens a simple page with the paper and your firm’s contact. The builder can stop it any time.', 'क्लाइंट को एक सादा पेज दिखेगा — काग़ज़ और आपकी फ़र्म का संपर्क। बिल्डर इसे कभी भी बंद कर सकता है।')}</p>
            <Err msg={err} />
            <button type="button" disabled={busy} data-testid="docshare-create" className={`${btnDark} w-full`} onClick={() => go(async () => { const r = await api.projDocShare({ projectId: doc.projectId, docId: doc.id, clientLabel: label, lang: l }); setUrl(siteUrl(r.path)); }, onDone)}><Link2 className="h-4 w-4" />{tx('Create client link', 'क्लाइंट का लिंक बनाएँ')}</button>
          </>
        )}
        {url && (
          <div className="space-y-2">
            <div className="rounded-lg bg-emerald-50 p-2 font-semibold text-emerald-800">{tx('Link ready', 'लिंक तैयार')}</div>
            <div className="break-all rounded-lg bg-slate-100 p-2 font-mono text-[11px]" data-testid="docshare-url">{url}</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={async () => say((await copyText(url)) ? tx('Link copied', 'लिंक कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ'))} className={btnLine}><Copy className="h-4 w-4" />{tx('Copy link', 'लिंक कॉपी')}</button>
              <button type="button" onClick={async () => say((await copyText(text)) ? tx('Message copied', 'मैसेज कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ'))} className={btnLine}><Copy className="h-4 w-4" />{tx('Copy message', 'मैसेज कॉपी')}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={`${btnDark} bg-emerald-700`}><MessageCircle className="h-4 w-4" />WhatsApp</a>
              <a href={url} target="_blank" rel="noreferrer" className={btnLine}><ExternalLink className="h-4 w-4" />{tx('Preview', 'प्रिव्यू')}</a>
            </div>
          </div>
        )}
        {flash && <div className="rounded-lg bg-slate-900 px-3 py-2 text-center font-semibold text-white">{flash}</div>}
      </div>
    </Sheet>
  );
};

// ───────────────────────── the card ─────────────────────────
export const ProjectDocsCard: React.FC<Props> = ({ role, projectId, refreshKey = 0 }) => {
  const tx = useTx();
  const [data, setData] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const [sheet, setSheet] = useState<null | { kind: 'team' | 'client'; id: string }>(null);
  const isBroker = role === 'BROKER';

  const load = useCallback(async () => {
    try { setData(await api.projDocs(projectId)); setErr(''); } catch (e: any) { setErr(e.message); setData({ docs: [], team: [], posts: [] }); }
    try { setLinks((await api.projDocShares()).links || []); } catch { setLinks([]); }
  }, [projectId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2500); };
  if (!data) return <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>;
  const docs: any[] = data.docs || [];
  const posts: any[] = data.posts || [];
  const live = links.filter(l => !l.revoked);
  const sheetDoc = sheet ? docs.find(d => d.id === sheet.id) : null;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs" data-testid="project-docs">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText className="h-4 w-4" />{tx('Project papers', 'प्रोजेक्ट के काग़ज़')}</div>
      <p className="text-[11px] text-slate-500">{isBroker
        ? tx('Brochures, price lists and plans the builder gave you. Show them to your team, or send a tracked page to a client.', 'बिल्डर ने आपको जो ब्रोशर, प्राइस लिस्ट और प्लान दिए। टीम को दिखाएँ, या क्लाइंट को ट्रैक होने वाला पेज भेजें।')
        : tx('Papers your employer showed you. Send to a client only where it says so.', 'आपके मालिक ने जो काग़ज़ दिखाए। क्लाइंट को सिर्फ़ वहीं भेजें जहाँ लिखा हो।')}</p>
      <Err msg={err} />
      {docs.length === 0 && !err && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-slate-500" data-testid="docs-empty">{isBroker ? tx('The builder has not shared any paper for this project yet.', 'बिल्डर ने इस प्रोजेक्ट के लिए अभी कोई काग़ज़ साझा नहीं किया।') : tx('Nothing has been shown to you yet.', 'अभी आपको कुछ दिखाया नहीं गया।')}</p>}
      <ul className="space-y-2">
        {docs.map(d => (
          <li key={d.id} className="space-y-1.5 rounded-lg border border-slate-200 p-2.5" data-testid="docs-row">
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-semibold text-sky-800 underline"><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{d.title}</span></a>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              {!projectId && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{d.projectName}</span>}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{KIND_WORD[d.kind] ? tx(KIND_WORD[d.kind][0], KIND_WORD[d.kind][1]) : d.kind}</span>
              {d.personal && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900" data-testid="docs-personal">{tx('Shared with you personally', 'सिर्फ़ आपको निजी तौर पर दिया')}</span>}
              {isBroker && (d.canClient ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">{tx('Team may send to clients', 'टीम क्लाइंट को भेज सकती है')}</span> : d.canTeam ? <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">{tx('Team may read, not send', 'टीम पढ़ सकती है, भेज नहीं सकती')}</span> : <span className="rounded bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-700">{tx('For you alone', 'सिर्फ़ आपके लिए')}</span>)}
              {isBroker && d.shownTo > 0 && <span className="text-slate-500">{tx(`${d.shownTo} live post(s)`, `${d.shownTo} लाइव पोस्ट`)}</span>}
            </div>
            {d.note && <p className="text-slate-600">“{d.note}”</p>}
            {d.fromNote && <p className="text-slate-600">{tx('Your employer says', 'मालिक का नोट')}: “{d.fromNote}”</p>}
            <div className="flex flex-wrap gap-1.5">
              {isBroker && d.canTeam && <button type="button" className={btnLine} data-testid="docs-show-team" onClick={() => setSheet({ kind: 'team', id: d.id })}><Users className="h-3.5 w-3.5" />{tx('Show to team', 'टीम को दिखाएँ')}</button>}
              {d.canClient && <button type="button" className={btnLine} data-testid="docs-send-client" onClick={() => setSheet({ kind: 'client', id: d.id })}><Send className="h-3.5 w-3.5" />{tx('Send to client', 'क्लाइंट को भेजें')}</button>}
            </div>
          </li>
        ))}
      </ul>

      {isBroker && posts.length > 0 && (
        <div className="space-y-1.5" data-testid="docs-posts">
          <div className="font-bold text-slate-700">{tx('Live with my team', 'मेरी टीम के पास अभी लाइव')}</div>
          {posts.map(p => (
            <div key={p.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 p-2">
              <div className="min-w-0"><div className="font-semibold">{(p.titles || []).slice(0, 3).join(', ')}{(p.titles || []).length > 3 ? ` +${p.titles.length - 3}` : ''}</div>
                <div className="text-[10px] text-slate-500">{p.memberNames.length ? p.memberNames.join(', ') : tx('Whole team', 'पूरी टीम')} · {p.allowClient ? tx('may send to clients', 'क्लाइंट को भेज सकते हैं') : tx('read only', 'सिर्फ़ पढ़ना')}</div>
                {p.note && <div className="text-slate-700">“{p.note}”</div>}</div>
              <button type="button" className={btnLine} data-testid="docs-post-end" onClick={async () => { try { await api.projDocPostEnd(p.id); await load(); say(tx('Stopped', 'बंद किया')); } catch (e: any) { setErr(e.message); } }}>{tx('End', 'बंद करें')}</button>
            </div>
          ))}
        </div>
      )}

      {live.length > 0 && (
        <div className="space-y-1.5" data-testid="docs-links">
          <div className="font-bold text-slate-700">{tx('Paper links I sent', 'मैंने जो काग़ज़ लिंक भेजे')}</div>
          <ul className="divide-y divide-slate-100">
            {live.slice(0, 20).map(l => (
              <li key={l.token} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0"><div className="font-semibold">{l.title} · {l.projectName}</div>
                  <div className="text-[10px] text-slate-500">{l.by ? `${l.by} · ` : ''}{l.clientLabel ? `${l.clientLabel} · ` : ''}{l.views} {l.views === 1 ? tx('view', 'व्यू') : tx('views', 'व्यू')}{l.lastViewAt ? ` · ${tx('last', 'आख़िरी')} ${ago(l.lastViewAt)}` : ''}</div></div>
                <div className="flex gap-1.5">
                  <button type="button" className={btnLine} onClick={async () => say((await copyText(siteUrl(`/s/${l.token}`))) ? tx('Link copied', 'लिंक कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ'))}><Copy className="h-3.5 w-3.5" />{tx('Copy', 'कॉपी')}</button>
                  <button type="button" className={btnLine} data-testid="docs-link-revoke" onClick={async () => { try { await api.projDocShareRevoke(l.token); await load(); } catch (e: any) { setErr(e.message); } }}><Trash2 className="h-3.5 w-3.5" />{tx('Revoke', 'बंद करें')}</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {flash && <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-center font-semibold text-white">{flash}</div>}

      {sheet?.kind === 'team' && sheetDoc && <TeamSheet docs={docs} firstId={sheetDoc.id} team={data.team || []} onClose={() => setSheet(null)} onDone={m => { setSheet(null); say(m); load(); }} />}
      {sheet?.kind === 'client' && sheetDoc && <ClientSheet doc={sheetDoc} onClose={() => { setSheet(null); load(); }} onDone={() => { load(); }} />}
    </section>
  );
};
