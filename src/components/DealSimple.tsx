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
import { formatINR } from '../lib/utils.js';

export type SimpleDoor = 'chat_call' | 'responsibilities' | 'commission_agreement' | 'media_vault' | 'due_diligence' | 'money';
const short = (n?: number) => !n ? '' : n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : formatINR(n);
const agoDays = (iso?: string) => iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400_000) : -1;

export const DealSimple: React.FC<{
  item?: any;                       // the Deal Hub row of this deal (stage, next steps, money, visits, tasks, agreement, last activity)
  doors: SimpleDoor[];              // the sections THIS person may open (the parent decides, from the same permissions as the tab bar)
  onOpen: (door: SimpleDoor | 'full') => void;
  onBookVisit?: () => void;         // only passed when this person may create a site visit
  phone?: string;                   // the other broker's number — the two brokers of a deal already see it in the chat header
}> = ({ item, doors, onOpen, phone, onBookVisit }) => {
  const tx = useTx(); const th = useTemplateHi();
  // the live cost sheet this broker already made for this deal's project (matched by project name; hidden when none / no access)
  const [sheet, setSheet] = useState<string>('');
  useEffect(() => {
    const t = String(item?.propertyTitle || '').trim().toLowerCase(); if (!t) { setSheet(''); return; }
    let live = true;
    api.costSheets().then((r: any) => { const m = (r.sheets || []).find((x: any) => !x.revoked && !x.expired && (String(x.projectName).toLowerCase().includes(t) || t.includes(String(x.projectName).toLowerCase()))); if (live) setSheet(m?.token || ''); }).catch(() => { if (live) setSheet(''); });
    return () => { live = false; };
  }, [item?.propertyTitle]);
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
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-tight text-slate-900">{d.label}</span>{!small && <span className="block truncate text-xs text-slate-500">{d.hint}</span>}</span>
      {dot(d.tab) && id !== 'money' ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-label={tx('needs you', 'आपका काम बाकी')} /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
    </button>
  ); };
  // v147 — laid out like a CRM deal screen (Pipedrive / Bigin): numbers, round quick actions, the history, then the sections
  const tel = (phone || '').replace(/\D/g, '').slice(-10);
  const round = 'flex min-h-11 w-[68px] shrink-0 flex-col items-center gap-1.5 text-center text-xs font-semibold text-ink active:scale-[.97] motion-safe:transition-transform';
  const ring = 'flex h-14 w-14 items-center justify-center rounded-full border border-edge bg-white shadow-card';
  const histText = (h: { k: string; t?: string }) => ({
    CREATED: tx('Deal started', 'डील शुरू हुई'), VISIT_DONE: tx('Site visit done', 'साइट विज़िट हुई'), VISIT_BOOKED: tx('Site visit booked', 'साइट विज़िट तय हुई'),
    TASK_DONE: tx(`Done: ${th(h.t || 'a task')}`, `पूरा: ${th(h.t || 'एक काम')}`), AGREEMENT_ACTIVE: tx('Agreement in force', 'समझौता लागू'), AGREEMENT_SENT: tx('Agreement sent', 'समझौता भेजा गया'),
    MSG_ME: tx('You wrote in chat', 'आपने चैट में लिखा'), MSG_OTHER: tx(`${item?.counterpartName || 'They'} wrote in chat`, `${item?.counterpartName || 'उन्होंने'} चैट में लिखा`),
  } as Record<string, string>)[h.k] || h.k;
  const BOTTOM: SimpleDoor[] = ['responsibilities', 'commission_agreement', 'money'];
  const bottom = doors.filter(d => BOTTOM.includes(d)); const extra = doors.filter(d => d === 'due_diligence');
  const history: { at: string; k: string; t?: string }[] = item?.history || [];

  return (
    <div className="space-y-3" data-testid="deal-simple">
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
            {history.slice(0, 4).map((h, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-gold-500" aria-hidden="true" /><span className="w-20 shrink-0 text-xs text-mute">{ago(h.at)}</span><span className="min-w-0 flex-1 font-medium text-ink">{histText(h)}</span>
              </li>
            ))}
          </ol></div>
        </section>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${bottom.length || 1}, minmax(0, 1fr))` }}>{bottom.map(id => { const d = all[id]; const Icon = d.icon; return (
        <button key={id} type="button" onClick={() => onOpen(id)} data-testid={`deal-door-${id}`} className="relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-[18px] border border-edge bg-white px-1 text-xs font-bold text-ink shadow-card active:bg-paper">
          <Icon className="h-5 w-5 text-navy-900" aria-hidden />{d.label}
          {dot(d.tab) && id !== 'money' && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-gold-500 ring-2 ring-white" aria-label={tx('needs you', 'आपका काम बाकी')} />}
        </button>
      ); })}</div>
      <details className="rounded-[18px] border border-edge bg-white shadow-card" data-testid="deal-simple-more">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-mute">{tx('More', 'और')}<ChevronRight className="h-4 w-4 rotate-90 opacity-60" aria-hidden /></summary>
        <div className="grid gap-2 p-2 pt-0">
          {extra.map(id => door(id, true))}
          <button type="button" onClick={() => onOpen('full')} data-testid="deal-simple-full" className="flex min-h-12 items-center gap-3 rounded-[14px] border border-edge bg-white px-3 text-left text-sm font-bold text-ink">
            <LayoutList className="h-5 w-5 shrink-0 text-slate-700" aria-hidden /><span className="flex-1">{tx('Full deal room', 'पूरा डील रूम')}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          </button>
        </div>
      </details>
    </div>
  );
};
