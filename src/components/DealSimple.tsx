/**
 * v99 — the SIMPLE deal room. The full deal room has ten sections; most days a broker needs four things:
 *   where is the deal (the stage, above) · what do I do next (above) · the few numbers that matter · a door to chat / tasks / agreement / photos.
 * Nothing is removed: "Full view" is one tap away and every section keeps its own id. This screen only reads what the Deal Hub already knows.
 */
import React from 'react';
import { MessageSquare, ListTodo, FileCheck2, FolderLock, ShieldCheck, IndianRupee, LayoutList, ChevronRight, CalendarCheck, Users, Clock, Shield, Phone, MessageCircle } from 'lucide-react';
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
  phone?: string;                   // the other broker's number — the two brokers of a deal already see it in the chat header
}> = ({ item, doors, onOpen, phone }) => {
  const tx = useTx(); const th = useTemplateHi();
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
  if (m?.myShare) facts.push({ k: 'share', label: tx('My share', 'मेरा हिस्सा'), value: short(m.myShare), tone: 'text-emerald-700', icon: IndianRupee });
  if (v) facts.push({ k: 'visits', label: tx('Site visits', 'साइट विज़िट'), value: v.total ? tx(`${v.verified} of ${v.total} done`, `${v.total} में से ${v.verified} हुईं`) : tx('None yet', 'अभी नहीं'), icon: CalendarCheck });
  if (t) facts.push({ k: 'tasks', label: tx('Duties', 'ज़िम्मेदारियाँ'), value: t.total ? tx(`${t.done} of ${t.total} done`, `${t.total} में से ${t.done} पूरी`) : tx('None yet', 'अभी नहीं'), tone: t.overdue ? 'text-red-700' : undefined, icon: ListTodo });
  if (typeof item?.protectionDaysLeft === 'number') facts.push({ k: 'prot', label: tx('Protection left', 'सुरक्षा बची'), value: item.protectionDaysLeft > 0 ? tx(`${item.protectionDaysLeft} days`, `${item.protectionDaysLeft} दिन`) : tx('Ended', 'खत्म'), tone: item.protectionDaysLeft <= 7 ? 'text-amber-700' : undefined, icon: Shield });
  if (item?.lastActivityAt) facts.push({ k: 'last', label: tx('Last activity', 'आख़िरी हलचल'), value: ago(item.lastActivityAt), tone: item.stalled ? 'text-amber-700' : undefined, icon: Clock });

  const all: Record<SimpleDoor, { icon: React.ElementType; label: string; hint: string; tab: string }> = {
    chat_call: { icon: MessageSquare, label: tx('Chat', 'चैट'), tab: 'chat_call', hint: item?.lastMessage ? (item.lastMessage.from === 'OTHER' ? tx(`They wrote ${ago(item.lastMessage.at)}`, `उनका मैसेज ${ago(item.lastMessage.at)}`) : tx(`You wrote ${ago(item.lastMessage.at)}`, `आपका मैसेज ${ago(item.lastMessage.at)}`)) : tx('No message yet', 'अभी कोई मैसेज नहीं') },
    responsibilities: { icon: ListTodo, label: tx('Tasks', 'काम'), tab: 'responsibilities', hint: t?.total ? tx(`${t.open} still open`, `${t.open} बाकी`) : tx('Who does what', 'कौन क्या करेगा') },
    commission_agreement: { icon: FileCheck2, label: tx('Agreement', 'समझौता'), tab: 'commission_agreement', hint: agText },
    media_vault: { icon: FolderLock, label: tx('Photos & papers', 'फ़ोटो और काग़ज़'), tab: 'media_vault', hint: tx('Photos, map, documents', 'फ़ोटो, लोकेशन, दस्तावेज़') },
    due_diligence: { icon: ShieldCheck, label: tx('Paper check', 'काग़ज़ों की जाँच'), tab: 'due_diligence', hint: tx('Due diligence & registry', 'जाँच और रजिस्ट्री की तैयारी') },
    money: { icon: IndianRupee, label: tx('Money', 'पैसा / हिसाब'), tab: 'overview', hint: tx('Final rate, commission, payments', 'फ़ाइनल रेट, कमीशन, भुगतान') },
  };

  const top = ['share', 'value', 'other'].map(k => facts.find(f => f.k === k)).filter(Boolean).slice(0, 3) as typeof facts;
  const door = (id: SimpleDoor, small?: boolean) => { const d = all[id]; const Icon = d.icon; return (
    <button key={id} type="button" onClick={() => onOpen(id)} data-testid={`deal-door-${id}`}
      className={`relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white text-left active:bg-slate-50 ${small ? 'min-h-12 px-3' : 'min-h-16 p-3 shadow-sm'}`}>
      <Icon className="h-5 w-5 shrink-0 text-slate-700" aria-hidden />
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-tight text-slate-900">{d.label}</span>{!small && <span className="block truncate text-xs text-slate-500">{d.hint}</span>}</span>
      {dot(d.tab) && id !== 'money' ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-label={tx('needs you', 'आपका काम बाकी')} /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
    </button>
  ); };
  // v147 — laid out like a CRM deal screen (Pipedrive / Bigin): numbers, round quick actions, the history, then the sections
  const tel = (phone || '').replace(/\D/g, '').slice(-10);
  const round = 'flex flex-1 flex-col items-center gap-1 text-xs font-semibold text-slate-700';
  const ring = 'flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm';
  const histText = (h: { k: string; t?: string }) => ({
    CREATED: tx('Deal started', 'डील शुरू हुई'), VISIT_DONE: tx('Site visit done', 'साइट विज़िट हुई'), VISIT_BOOKED: tx('Site visit booked', 'साइट विज़िट तय हुई'),
    TASK_DONE: tx(`Done: ${th(h.t || 'a task')}`, `पूरा: ${th(h.t || 'एक काम')}`), AGREEMENT_ACTIVE: tx('Agreement in force', 'समझौता लागू'), AGREEMENT_SENT: tx('Agreement sent', 'समझौता भेजा गया'),
    MSG_ME: tx('You wrote in chat', 'आपने चैट में लिखा'), MSG_OTHER: tx(`${item?.counterpartName || 'They'} wrote in chat`, `${item?.counterpartName || 'उन्होंने'} चैट में लिखा`),
  } as Record<string, string>)[h.k] || h.k;
  const BOTTOM: SimpleDoor[] = ['responsibilities', 'commission_agreement', 'money'];
  const bottom = doors.filter(d => BOTTOM.includes(d)); const extra = doors.filter(d => d === 'due_diligence');
  const history: { at: string; k: string; t?: string }[] = item?.history || [];

  return (
    <div className="space-y-4" data-testid="deal-simple">
      {top.length > 0 && (
        <dl aria-label={tx('The deal at a glance', 'डील एक नज़र में')} className="flex divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white py-2.5 text-center shadow-sm" data-testid="deal-simple-facts">
          {top.map(f => (
            <div key={f.k} className="min-w-0 flex-1 px-2" data-testid={`deal-fact-${f.k}`}>
              <dd className={`truncate text-sm font-bold ${f.tone || 'text-slate-900'}`}>{f.value}</dd>
              <dt className="truncate text-xs text-slate-500">{f.label}</dt>
            </div>
          ))}
        </dl>
      )}
      <div className="flex gap-1" data-testid="deal-simple-doors">
        {tel.length === 10 && <a href={`tel:+91${tel}`} className={round} data-testid="deal-call"><span className={ring}><Phone className="h-5 w-5 text-emerald-700" aria-hidden /></span>{tx('Call', 'कॉल')}</a>}
        {tel.length === 10 && <a href={`https://wa.me/91${tel}`} target="_blank" rel="noreferrer" className={round} data-testid="deal-wa"><span className={ring}><MessageCircle className="h-5 w-5 text-emerald-700" aria-hidden /></span>WhatsApp</a>}
        {doors.includes('chat_call') && <button type="button" onClick={() => onOpen('chat_call')} className={round} data-testid="deal-door-chat_call"><span className={`${ring} relative`}><MessageSquare className="h-5 w-5 text-slate-800" aria-hidden />{dot('chat_call') && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-amber-500" aria-label={tx('needs you', 'आपका काम बाकी')} />}</span>{tx('Chat', 'चैट')}</button>}
        {doors.includes('media_vault') && <button type="button" onClick={() => onOpen('media_vault')} className={round} data-testid="deal-door-media_vault"><span className={ring}><FolderLock className="h-5 w-5 text-slate-800" aria-hidden /></span>{tx('Papers', 'काग़ज़')}</button>}
      </div>
      {history.length > 0 && (
        <section data-testid="deal-history">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{tx('History', 'अब तक क्या हुआ')}</h3>
          <ol className="rounded-xl border border-slate-200 bg-white px-3 py-1 shadow-sm">
            {history.slice(0, 4).map((h, i) => (
              <li key={i} className="flex items-baseline gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
                <span className="w-20 shrink-0 text-xs text-slate-500">{ago(h.at)}</span><span className="min-w-0 flex-1 text-slate-800">{histText(h)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${bottom.length || 1}, minmax(0, 1fr))` }}>{bottom.map(id => { const d = all[id]; const Icon = d.icon; return (
        <button key={id} type="button" onClick={() => onOpen(id)} data-testid={`deal-door-${id}`} className="relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-1 text-xs font-bold text-slate-900 shadow-sm active:bg-slate-50">
          <Icon className="h-5 w-5 text-slate-700" aria-hidden />{d.label}
          {dot(d.tab) && id !== 'money' && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-amber-500" aria-label={tx('needs you', 'आपका काम बाकी')} />}
        </button>
      ); })}</div>
      <details className="rounded-xl border border-slate-200 bg-white" data-testid="deal-simple-more">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-slate-600">{tx('More', 'और')}<ChevronRight className="h-4 w-4 rotate-90 opacity-60" aria-hidden /></summary>
        <div className="grid gap-2 p-2 pt-0">
          {extra.map(id => door(id, true))}
          <button type="button" onClick={() => onOpen('full')} data-testid="deal-simple-full" className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-bold text-slate-900">
            <LayoutList className="h-5 w-5 shrink-0 text-slate-700" aria-hidden /><span className="flex-1">{tx('Full deal room', 'पूरा डील रूम')}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          </button>
        </div>
      </details>
    </div>
  );
};
