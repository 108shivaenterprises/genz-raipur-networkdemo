/**
 * v99 — the SIMPLE deal room. The full deal room has ten sections; most days a broker needs four things:
 *   where is the deal (the stage, above) · what do I do next (above) · the few numbers that matter · a door to chat / tasks / agreement / photos.
 * Nothing is removed: "Full view" is one tap away and every section keeps its own id. This screen only reads what the Deal Hub already knows.
 */
import React from 'react';
import { MessageSquare, ListTodo, FileCheck2, FolderLock, ShieldCheck, IndianRupee, LayoutList, ChevronRight, CalendarCheck, Users, Clock, Shield } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

export type SimpleDoor = 'chat_call' | 'responsibilities' | 'commission_agreement' | 'media_vault' | 'due_diligence' | 'money';
const short = (n?: number) => !n ? '' : n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : formatINR(n);
const agoDays = (iso?: string) => iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400_000) : -1;

export const DealSimple: React.FC<{
  item?: any;                       // the Deal Hub row of this deal (stage, next steps, money, visits, tasks, agreement, last activity)
  doors: SimpleDoor[];              // the sections THIS person may open (the parent decides, from the same permissions as the tab bar)
  onOpen: (door: SimpleDoor | 'full') => void;
}> = ({ item, doors, onOpen }) => {
  const tx = useTx();
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
    responsibilities: { icon: ListTodo, label: tx('Who does what', 'कौन क्या करेगा'), tab: 'responsibilities', hint: t?.total ? tx(`${t.open} still open`, `${t.open} बाकी`) : tx('Duties of both sides', 'दोनों तरफ़ की ज़िम्मेदारी') },
    commission_agreement: { icon: FileCheck2, label: tx('Agreement', 'समझौता'), tab: 'commission_agreement', hint: agText },
    media_vault: { icon: FolderLock, label: tx('Photos & papers', 'फ़ोटो और काग़ज़'), tab: 'media_vault', hint: tx('Photos, map, documents', 'फ़ोटो, लोकेशन, दस्तावेज़') },
    due_diligence: { icon: ShieldCheck, label: tx('Paper check', 'काग़ज़ों की जाँच'), tab: 'due_diligence', hint: tx('Due diligence & registry', 'जाँच और रजिस्ट्री की तैयारी') },
    money: { icon: IndianRupee, label: tx('Rate & हिसाब', 'रेट और हिसाब'), tab: 'overview', hint: tx('Final rate, commission, payments', 'फ़ाइनल रेट, कमीशन, भुगतान') },
  };

  return (
    <div className="space-y-3" data-testid="deal-simple">
      {facts.length > 0 && (
        <section aria-label={tx('The deal at a glance', 'डील एक नज़र में')} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="deal-simple-facts">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{tx('At a glance', 'एक नज़र में')}</h4>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {facts.map(f => (
              <div key={f.k} className="min-w-0" data-testid={`deal-fact-${f.k}`}>
                <dt className="flex items-center gap-1 text-xs text-slate-500"><f.icon className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{f.label}</span></dt>
                <dd className={`mt-0.5 truncate text-sm font-bold ${f.tone || 'text-slate-900'}`}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-label={tx('Open a section', 'सेक्शन खोलें')}>
        <h4 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wider text-slate-500">{tx('Open', 'खोलें')}</h4>
        <div className="grid grid-cols-2 gap-2" data-testid="deal-simple-doors">
          {doors.map(id => { const d = all[id]; const Icon = d.icon; return (
            <button key={id} type="button" onClick={() => onOpen(id)} data-testid={`deal-door-${id}`}
              className="relative flex min-h-[92px] flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm active:bg-slate-50">
              <Icon className="h-5 w-5 text-slate-700" aria-hidden />
              <span className="text-sm font-bold leading-tight text-slate-900">{d.label}</span>
              <span className="text-xs leading-snug text-slate-500">{d.hint}</span>
              {dot(d.tab) && id !== 'money' && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-amber-500" aria-label={tx('needs you', 'आपका काम बाकी')} />}
            </button>
          ); })}
        </div>
      </section>

      <button type="button" onClick={() => onOpen('full')} data-testid="deal-simple-full"
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 text-left text-sm font-semibold text-slate-800">
        <span className="flex items-center gap-2"><LayoutList className="h-4 w-4" aria-hidden />{tx('Open the full deal room', 'पूरा डील रूम खोलें')}<span className="text-xs font-normal text-slate-500">{tx('· rules, legal help, disputes…', '· नियम, क़ानूनी मदद, विवाद…')}</span></span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </button>
    </div>
  );
};
