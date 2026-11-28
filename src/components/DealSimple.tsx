/**
 * v99 — the SIMPLE deal room. The full deal room has ten sections; most days a broker needs four things:
 *   where is the deal (the stage, above) · what do I do next (above) · the few numbers that matter · a door to chat / tasks / agreement / photos.
 * Nothing is removed: "Full view" is one tap away and every section keeps its own id. This screen only reads what the Deal Hub already knows.
 */
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { MessageSquare, ListTodo, FileCheck2, FolderLock, ShieldCheck, IndianRupee, LayoutList, ChevronRight, CalendarCheck, Users, Clock, Shield, Phone, MessageCircle, Receipt } from 'lucide-react';
import { useTemplateHi } from '../lib/templateHi.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { formatINR } from '../lib/utils.js';

export type SimpleDoor = 'chat_call' | 'responsibilities' | 'commission_agreement' | 'media_vault' | 'due_diligence' | 'money';
const short = (n?: number) => !n ? '' : n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : formatINR(n);
const agoDays = (iso?: string) => iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400_000) : -1;

export const DealSimple: React.FC<{
  item?: any;                       // the Deal Hub row of this deal (stage, next steps, money, visits, tasks, agreement, last activity)
  doors: SimpleDoor[];              // the sections THIS person may open (the parent decides, from the same permissions as the tab bar)
  onOpen: (door: SimpleDoor | 'full') => void;
  onBookVisit?: () => void;         // only passed when this person may create a site visit
  onFileDispute?: () => void;       // D23 r13 — only passed when this person may file a dispute: reachable on a phone, where the full room's tab is not
  meId?: string;                    // v183 — whose ticket to show (an admin must not see other people's)
  canCostSheet?: boolean;           // v183 — only roles that may open Share / cost sheets call that endpoint (others used to get a 403)
  phone?: string;                   // the other broker's number — the two brokers of a deal already see it in the chat header
  pending?: { id: string; en: string; hi: string; go: () => void }[];   // v178: what the Full room shows as "Pending" for this person (owner's mandate, visit OTP) — never "nothing" while Full says otherwise
}> = ({ item, doors, onOpen, phone, onBookVisit, pending = [], canCostSheet = false, meId = '', onFileDispute }) => {
  const tx = useTx(); const th = useTemplateHi(); const label = useLabel();
  // the live cost sheet this broker already made for this deal's project (matched by project name; hidden when none / no access)
  const [sheet, setSheet] = useState<string>('');
  useEffect(() => {
    const t = String(item?.propertyTitle || '').trim().toLowerCase(); if (!t || !canCostSheet) { setSheet(''); return; }
    let live = true;
    api.costSheets().then((r: any) => { const m = (r.sheets || []).find((x: any) => !x.revoked && !x.expired && (String(x.projectName).toLowerCase().includes(t) || t.includes(String(x.projectName).toLowerCase()))); if (live) setSheet(m?.token || ''); }).catch(() => { if (live) setSheet(''); });
    return () => { live = false; };
  }, [item?.propertyTitle, canCostSheet]);
  const ago = (iso?: string) => { const d = agoDays(iso); return d < 0 ? '' : d === 0 ? tx('today', 'आज') : d === 1 ? tx('yesterday', 'कल') : tx(`${d} days ago`, `${d} दिन पहले`); };
  const next: any[] = item?.next || [];
  const dot = (tab: string) => next.some(n => n.tab === tab && n.kind !== 'STALLED');
  const ag = item?.agreement;
  const agText = !ag ? tx('Not made yet', 'अभी नहीं बना')
    : ag.status === 'ACTIVE' ? tx('In force', 'लागू')
      : ag.waitingOn > 0 ? tx(`${ag.waitingOn} yes still awaited`, `${ag.waitingOn} की हाँ बाकी`) : tx('Sent', 'भेजा गया');
  const t = item?.tasks; const v = item?.visits; const m = item?.money;

  const facts: { k: string; label: string; value: string; tone?: string; icon: React.ElementType }[] = [];
  if (item?.counterpartName) facts.push({ k: 'other', label: tx('Other broker', 'दूसरा ब्रोकर'), value: item.counterpartName, icon: Users });
  if (m?.dealValue) facts.push({ k: 'value', label: tx('Deal value', 'डील की कीमत'), value: short(m.dealValue), icon: IndianRupee });
  if (m?.myShare) facts.push({ k: 'share', label: item?.openDispute ? tx('Share on hold', 'हिस्सा रुका') : tx('My share', 'मेरा हिस्सा'), value: short(m.myShare), tone: item?.openDispute ? 'text-warn' : 'text-money', icon: IndianRupee });
  if (v) facts.push({ k: 'visits', label: tx('Site visits', 'साइट विज़िट'), value: v.total ? tx(`${v.verified} of ${v.total} done`, `${v.total} में से ${v.verified} हुईं`) : tx('None yet', 'अभी नहीं'), icon: CalendarCheck });
  if (t) facts.push({ k: 'tasks', label: tx('Duties', 'ज़िम्मेदारियाँ'), value: t.total ? tx(`${t.done} of ${t.total} done`, `${t.total} में से ${t.done} पूरी`) : tx('None yet', 'अभी नहीं'), tone: t.overdue ? 'text-bad' : undefined, icon: ListTodo });
  if (typeof item?.protectionDaysLeft === 'number') facts.push({ k: 'prot', label: tx('Protection left', 'सुरक्षा बची'), value: item.protectionDaysLeft > 0 ? tx(`${item.protectionDaysLeft} days`, `${item.protectionDaysLeft} दिन`) : tx('Ended', 'खत्म'), tone: item.protectionDaysLeft <= 7 ? 'text-warn' : undefined, icon: Shield });
  if (item?.lastActivityAt) facts.push({ k: 'last', label: tx('Last activity', 'आख़िरी हलचल'), value: ago(item.lastActivityAt), tone: item.stalled ? 'text-warn' : undefined, icon: Clock });

  const all: Record<SimpleDoor, { icon: React.ElementType; label: string; hint: string; tab: string }> = {
    chat_call: { icon: MessageSquare, label: tx('Chat', 'चैट'), tab: 'chat_call', hint: item?.lastMessage ? (item.lastMessage.from === 'OTHER' ? tx(`They wrote ${ago(item.lastMessage.at)}`, `उनका मैसेज ${ago(item.lastMessage.at)}`) : tx(`You wrote ${ago(item.lastMessage.at)}`, `आपका मैसेज ${ago(item.lastMessage.at)}`)) : tx('No message yet', 'अभी कोई मैसेज नहीं') },
    responsibilities: { icon: ListTodo, label: tx('Tasks', 'काम'), tab: 'responsibilities', hint: t?.total ? tx(`${t.open} still open`, `${t.open} बाकी`) : tx('Who does what', 'कौन क्या करेगा') },
    commission_agreement: { icon: FileCheck2, label: tx('Agreement', 'समझौता'), tab: 'commission_agreement', hint: agText },
    media_vault: { icon: FolderLock, label: tx('Photos & papers', 'फ़ोटो और काग़ज़'), tab: 'media_vault', hint: tx('Photos, map, documents', 'फ़ोटो, लोकेशन, दस्तावेज़') },
    due_diligence: { icon: ShieldCheck, label: tx('Paper check', 'काग़ज़ों की जाँच'), tab: 'due_diligence', hint: tx('Tick the papers you have seen', 'जो काग़ज़ देखे उन पर टिक') },
    money: { icon: IndianRupee, label: tx('Money', 'पैसा / हिसाब'), tab: 'overview', hint: tx('Final rate, commission, payments', 'फ़ाइनल रेट, कमीशन, भुगतान') },
  };

  const protSoon = typeof item?.protectionDaysLeft === 'number' && item.protectionDaysLeft <= 7;
  const top = ['share', 'value', ...(protSoon ? ['prot'] : []), 'other'].map(k => facts.find(f => f.k === k)).filter(Boolean).slice(0, 3) as typeof facts;
  const door = (id: SimpleDoor, small?: boolean) => { const d = all[id]; const Icon = d.icon; return (
    <button key={id} type="button" onClick={() => onOpen(id)} data-testid={`deal-door-${id}`}
      className={`relative flex items-center gap-3 rounded-[18px] border border-edge bg-white text-left active:bg-paper ${small ? 'min-h-12 px-3' : 'min-h-16 p-3 shadow-card'}`}>
      <Icon className="h-5 w-5 shrink-0 text-slate-700" aria-hidden />
      <span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold leading-tight text-slate-900">{d.label}</span>{!small && <span className="block truncate text-xs text-slate-500">{d.hint}</span>}</span>
      {dot(d.tab) && id !== 'money' ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-label={tx('needs you', 'आपका काम बाकी')} /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
    </button>
  ); };
  // v147 — laid out like a CRM deal screen (Pipedrive / Bigin): numbers, round quick actions, the history, then the sections
  const tel = (phone || '').replace(/\D/g, '').slice(-10);
  const round = 'flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1.5 break-words text-center text-xs font-semibold leading-tight text-ink active:scale-[.97] motion-safe:transition-transform';
  const ring = 'flex h-14 w-14 items-center justify-center rounded-full border border-edge bg-white shadow-card';
  const histText = (h: { k: string; t?: string }) => ({
    CREATED: tx('Deal started', 'डील शुरू हुई'), VISIT_DONE: tx('Site visit done', 'साइट विज़िट हुई'), VISIT_BOOKED: tx('Site visit booked', 'साइट विज़िट तय हुई'),
    TASK_DONE: tx(`Done: ${th(h.t || 'a task')}`, `पूरा: ${th(h.t || 'एक काम')}`), AGREEMENT_ACTIVE: tx('Agreement in force', 'समझौता लागू'), AGREEMENT_SENT: tx('Agreement sent', 'समझौता भेजा गया'),
    STAGE: tx(`Moved to ${h.t || 'next stage'}`, `अगले चरण पर: ${label('dealStage', h.t || '') || h.t || ''}`), PAY_ENTERED: tx('Commission payment written down', 'कमीशन भुगतान दर्ज हुआ'), PAY_CONFIRMED: tx('Commission payment confirmed', 'कमीशन भुगतान पक्का हुआ'),
    DISPUTE_RAISED: tx('Dispute raised', 'विवाद दर्ज हुआ'), DISPUTE_RESOLVED: tx('Dispute resolved', 'विवाद सुलझा'), CLOSE_ASKED: tx('Close asked', 'डील बंद करने का अनुरोध'), CLOSED: tx('Deal room closed', 'डील रूम बंद'), REOPENED: tx('Deal room reopened', 'डील रूम फिर खुला'),
    MSG_ME: tx('You wrote in chat', 'आपने चैट में लिखा'), MSG_OTHER: tx(`${item?.counterpartName || 'They'} wrote in chat`, `${item?.counterpartName || 'उन्होंने'} चैट में लिखा`),
  } as Record<string, string>)[h.k] || h.k;
  const BOTTOM: SimpleDoor[] = ['responsibilities', 'commission_agreement', 'money'];
  const bottom = doors.filter(d => BOTTOM.includes(d)); const extra = doors.filter(d => d === 'due_diligence');
  const history: { at: string; k: string; t?: string }[] = item?.history || [];
  const [allHist, setAllHist] = useState(false);
  const [help, setHelp] = useState<any>(null); const [helpOpen, setHelpOpen] = useState(false); const [helpText, setHelpText] = useState(''); const [helpErr, setHelpErr] = useState(''); const [helpBusy, setHelpBusy] = useState(false);
  const [replyDays, setReplyDays] = useState(0); const [helpFail, setHelpFail] = useState(false); const [helpTick, setHelpTick] = useState(0);
  useEffect(() => {
    if (!item?.id) return; let live = true; setHelp(null); setHelpFail(false);
    api.myRequests().then(r => { if (live) setHelp((r.requests || []).filter((x: any) => x.dealRoomId === item.id && x.userId === meId).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))[0] || null); }).catch(() => { if (live) setHelpFail(true); });
    return () => { live = false; };
  }, [item?.id, meId, helpTick]);
  const loadHelp = () => setHelpTick(t => t + 1);

  return (
    <div className="space-y-3" data-testid="deal-simple">
      {item?.settledElsewhere && <div role="status" data-testid="deal-settled-elsewhere" className="rounded-[20px] border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{tx('This property was settled in another deal. New offers on it are blocked.', 'यह प्रॉपर्टी दूसरी डील में पूरी हो चुकी है। इस पर नए ऑफ़र बंद हैं।')}</div>}
      {top.length > 0 && (
        <dl aria-label={tx('The deal at a glance', 'डील एक नज़र में')} className="flex divide-x divide-edge rounded-[20px] border border-edge bg-white py-3 text-center shadow-card" data-testid="deal-simple-facts">
          {top.map(f => (
            <div key={f.k} className="min-w-0 flex-1 px-2" data-testid={`deal-fact-${f.k}`}>
              <dd className={`truncate text-lg font-extrabold ${f.tone || 'text-ink'}`}>{f.value}</dd>
              <dt className="truncate text-xs text-mute">{f.label}</dt>
            </div>
          ))}
        </dl>
      )}
      {pending.length > 0 && (
        <section className="space-y-1.5 rounded-[20px] border border-amber-300 bg-amber-50 p-3" data-testid="deal-simple-pending" aria-label={tx('Waiting for you', 'आपका इंतज़ार')}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-900">{tx('Waiting for you', 'आपका इंतज़ार')}</h3>
          {pending.map(p => (
            <button key={p.id} type="button" onClick={p.go} data-testid={`deal-pending-${p.id}`} className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-white px-3 text-left text-sm font-semibold text-slate-900 active:bg-paper">
              <span className="min-w-0 flex-1">{tx(p.en, p.hi)}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            </button>
          ))}
        </section>
      )}
      <div className="flex justify-between gap-1" data-testid="deal-simple-doors">
        {onBookVisit && <button type="button" onClick={onBookVisit} className={round} data-testid="deal-book-visit"><span className="flex h-14 w-14 items-center justify-center rounded-full border border-money bg-money text-white shadow-card"><CalendarCheck className="h-5 w-5" aria-hidden /></span>{tx('Book visit', 'विज़िट तय करें')}</button>}
        {tel.length === 10 && <a href={`tel:+91${tel}`} className={round} data-testid="deal-call"><span className={ring}><Phone className="h-6 w-6 text-money" aria-hidden /></span>{tx('Call', 'कॉल')}</a>}
        {tel.length === 10 && <a href={`https://wa.me/91${tel}`} target="_blank" rel="noreferrer" className={round} data-testid="deal-wa"><span className={ring}><MessageCircle className="h-6 w-6 text-money" aria-hidden /></span>WhatsApp</a>}
        {doors.includes('chat_call') && <button type="button" onClick={() => onOpen('chat_call')} className={round} data-testid="deal-door-chat_call"><span className={`${ring} relative`}><MessageSquare className="h-6 w-6 text-navy-900" aria-hidden />{dot('chat_call') && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-gold-500 ring-2 ring-white" aria-label={tx('needs you', 'आपका काम बाकी')} />}</span>{tx('Chat', 'चैट')}</button>}
        {doors.includes('media_vault') && <button type="button" onClick={() => onOpen('media_vault')} className={round} data-testid="deal-door-media_vault"><span className={ring}><FolderLock className="h-6 w-6 text-navy-900" aria-hidden /></span>{tx('Papers', 'काग़ज़')}</button>}
      </div>
      {sheet && <a href={`/s/${sheet}`} target="_blank" rel="noopener noreferrer" data-testid="deal-costsheet" className="flex min-h-11 items-center gap-2 rounded-[18px] border border-edge bg-white px-3 text-sm font-bold text-ink shadow-card"><Receipt className="h-5 w-5 text-navy-900" aria-hidden />{tx('Cost sheet', 'कॉस्ट शीट')}<ChevronRight className="ml-auto h-4 w-4 text-slate-300" aria-hidden /></a>}
      {history.length > 0 && (
        <section data-testid="deal-history">
          <div className="rounded-[20px] border border-edge bg-white p-3.5 shadow-card"><h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-mute">{tx('History', 'अब तक क्या हुआ')}</h3>
          <ol>
            {(allHist ? history : history.slice(0, 4)).map((h, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-gold-500" aria-hidden="true" /><span className="w-20 shrink-0 text-xs text-mute">{ago(h.at)}</span><span className="min-w-0 flex-1 font-medium text-ink">{histText(h)}</span>
              </li>
            ))}
          </ol>
          {history.length > 4 && <button type="button" onClick={() => setAllHist(v => !v)} data-testid="deal-history-all" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-money">{allHist ? tx('Show less', 'कम दिखाएँ') : tx(`See all (${history.length})`, `सब देखें (${history.length})`)}</button>}</div>
        </section>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${bottom.length || 1}, minmax(0, 1fr))` }}>{bottom.map(id => { const d = all[id]; const Icon = d.icon; return (
        <button key={id} type="button" onClick={() => onOpen(id)} data-testid={`deal-door-${id}`} className="relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-[18px] border border-edge bg-white px-1 text-xs font-bold text-ink shadow-card active:bg-paper">
          <Icon className="h-5 w-5 text-navy-900" aria-hidden />{d.label}
          {dot(d.tab) && id !== 'money' && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-gold-500 ring-2 ring-white" aria-label={tx('needs you', 'आपका काम बाकी')} />}
        </button>
      ); })}</div>
      {item?.id && !item.summaryOnly && (
        <section className="rounded-[18px] border border-edge bg-white p-3 shadow-card" data-testid="deal-help">
          {help && help.status === 'OPEN' && <p className="mb-1 text-xs text-slate-600" data-testid="deal-help-sla">{tx(`GENZ replies within ${replyDays || 15} days.`, `GENZ ${replyDays || 15} दिन के अंदर जवाब देता है।`)}</p>}
          {help && <p className="mb-2 text-sm" data-testid="deal-help-status"><b>{help.status === 'OPEN' ? tx('Your question to GENZ: Open', 'GENZ से आपका सवाल: खुला') : help.status === 'REJECTED' ? tx('Your question to GENZ: Closed', 'GENZ से आपका सवाल: बंद') : tx('Your question to GENZ: Answered', 'GENZ से आपका सवाल: जवाब आ गया')}</b><span className="block break-words text-xs text-mute" data-testid="deal-help-echo">{tx('You wrote', 'आपने लिखा')}: “{String(help.details || '').replace(/^\[[^\]]*\]\s*/, '')}”</span><span className="block text-xs text-mute" data-testid="deal-help-id">{tx('Ticket', 'टिकट')} {help.id}{help.status === 'OPEN' ? tx(' · GENZ will reply here', ' · GENZ जवाब यहीं देगा') : ''}</span>{help.resolutionNote ? <span className="block break-words text-xs text-ink">{tx('GENZ replied', 'GENZ का जवाब')}: {help.resolutionNote}</span> : null}</p>}
          {helpFail && <button type="button" onClick={loadHelp} data-testid="deal-help-retry" className="flex min-h-11 w-full items-center justify-center rounded-xl border border-edge px-3 text-sm font-semibold text-ink">{tx('Could not check your GENZ question — tap to retry', 'GENZ वाला सवाल देख नहीं पाए — फिर कोशिश करें')}</button>}
          {!helpFail && (!help || help.status !== 'OPEN') && !helpOpen && <button type="button" onClick={() => setHelpOpen(true)} data-testid="deal-help-open" className="flex min-h-11 w-full items-center justify-center rounded-xl border border-edge px-3 text-sm font-bold text-ink">{tx('Problem with this deal? Ask GENZ', 'इस डील में दिक्कत? GENZ से पूछें')}</button>}
          {helpOpen && (
            <div className="space-y-2">
              <textarea value={helpText} onChange={e => setHelpText(e.target.value)} maxLength={500} rows={3} data-testid="deal-help-text" placeholder={tx('What is the problem? (min 5 characters). This does not freeze any payment.', 'क्या दिक्कत है? (कम से कम 5 अक्षर)। इससे कोई भुगतान नहीं रुकता।')} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              {helpErr && <p className="text-xs text-red-700" role="alert">{helpErr}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={helpBusy || helpText.trim().length < 5} data-testid="deal-help-send" onClick={async () => { setHelpBusy(true); setHelpErr(''); try { const sent = await api.dealHelp(item.id, helpText.trim()); setReplyDays(Number(sent?.respondWithinDays) || 0); setHelpOpen(false); setHelpText(''); loadHelp(); } catch (e: any) { setHelpErr(e?.message || tx('Could not send. Try again.', 'भेज नहीं पाए। फिर कोशिश करें।')); } finally { setHelpBusy(false); } }} className="min-h-11 flex-1 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50">{tx('Send to GENZ', 'GENZ को भेजें')}</button>
                <button type="button" onClick={() => setHelpOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold">{tx('Cancel', 'रद्द करें')}</button>
              </div>
            </div>
          )}
        </section>
      )}
      <details className="rounded-[18px] border border-edge bg-white shadow-card" data-testid="deal-simple-more">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-mute">{tx('More', 'और')}<ChevronRight className="h-4 w-4 rotate-90 opacity-60" aria-hidden /></summary>
        <div className="grid gap-2 p-2 pt-0">
          {extra.map(id => door(id, true))}
          {onFileDispute && <button type="button" onClick={onFileDispute} data-testid="deal-file-dispute" className="flex min-h-12 items-center gap-3 rounded-[14px] border border-rose-200 bg-rose-50 px-3 text-left text-sm font-semibold text-rose-800"><span className="flex-1">{tx('File Formal Dispute', 'औपचारिक विवाद दर्ज करें')}</span><ChevronRight className="h-4 w-4" aria-hidden /></button>}
          <button type="button" onClick={() => onOpen('full')} data-testid="deal-simple-full" className="flex min-h-12 items-center gap-3 rounded-[14px] border border-edge bg-white px-3 text-left text-sm font-bold text-ink">
            <LayoutList className="h-5 w-5 shrink-0 text-slate-700" aria-hidden /><span className="flex-1">{tx('Full deal room', 'पूरा डील रूम')}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          </button>
        </div>
      </details>
    </div>
  );
};
