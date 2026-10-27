/**
 * v79 — the counters on a broker's Home are ALSO lines in the notification bell.
 *
 * One list says what each counter is called (English + Hindi), which screen it opens, and which colour it has. The Home tiles
 * (BrokerHome.tsx) and the bell (server/homebell.ts) are both built from it, so a counter can never be on the Home and missing from the bell.
 *
 * A bell line is a "to do" line: one per counter, kept in step with the number —
 *   the number goes up        → the line comes back as unread, at the top (even if the person had removed it);
 *   the number goes down      → the words follow, the read mark (and a removal) stay;
 *   the number reaches zero   → the line goes away (the work is done).
 * Pure functions: the server and the tests use exactly this code.
 */
import type { InboxItem } from './inboxRules.js';

export type TodoTone = 'emerald' | 'indigo' | 'amber' | 'slate';
export interface TodoDef {
  /** the key in the Home counts (brokerHomeCounts) */
  key: string;
  en: string; hi: string;
  /** the tab it opens, plus the same extra query parameters the Home tile sets */
  tab: string; params?: Record<string, string>;
  tone: TodoTone;
  testId?: string;
}

export const HOME_TODOS: readonly TodoDef[] = [
  { key: 'offersWaiting', en: 'A broker sent you a co-broking offer — answer it', hi: 'किसी ब्रोकर ने को-ब्रोकिंग ऑफ़र भेजा है — जवाब दें', tab: 'deals', params: { view: 'proposals' }, tone: 'amber', testId: 'tile-offers' },
  { key: 'billsToConfirm', en: 'A client says the brokerage is paid — check & confirm', hi: 'क्लाइंट ने ब्रोकरेज चुकाया बताया — जाँचें और पुष्टि करें', tab: 'deals', params: undefined, tone: 'emerald', testId: 'tile-bills-confirm' },
  { key: 'billsOverdue', en: 'Brokerage bills past due — send a reminder', hi: 'ब्रोकरेज बिल की तारीख़ निकल गई — रिमाइंडर भेजें', tab: 'deals', params: undefined, tone: 'amber', testId: 'tile-bills-overdue' },
  { key: 'partnerCodes', en: 'A shop partner is waiting for his code — read it out', hi: 'दुकान पार्टनर कोड माँग रहे हैं — उन्हें बताएँ', tab: 'partners', params: undefined, tone: 'amber', testId: 'tile-sp-codes' },
  { key: 'partnerNew', en: 'New leads from your shop QR — call them', hi: 'दुकान QR से नई लीड — कॉल करें', tab: 'partners', params: undefined, tone: 'emerald', testId: 'tile-sp-new' },
  { key: 'pageNew', en: 'New enquiries from your public page — reply to them', hi: 'आपके पब्लिक पेज से नई पूछताछ — जवाब दें', tab: 'mypage', params: undefined, tone: 'emerald', testId: 'tile-page-enq' },
  { key: 'rentEnding', en: 'Rent agreements ending soon — ask owner & tenant: renew or re-let?', hi: 'किराया अनुबंध जल्द ख़त्म — मालिक और किरायेदार से पूछें: रिन्यू या नया किरायेदार?', tab: 'rentdesk', params: undefined, tone: 'amber', testId: 'tile-rent-ending' },
  { key: 'rentPolice', en: 'Tenant police verification pending', hi: 'किरायेदार का पुलिस वेरिफ़िकेशन बाक़ी', tab: 'rentdesk', params: undefined, tone: 'amber', testId: 'tile-rent-police' },
  { key: 'rentToRecord', en: 'A rent deal is done — put it on your Rent desk', hi: 'किराये की डील हो गई — किराया डेस्क पर दर्ज करें', tab: 'rentdesk', params: undefined, tone: 'indigo', testId: 'tile-rent-record' },
  { key: 'partnerDue', en: 'Shop partner’s share to pay', hi: 'दुकान पार्टनर का हिस्सा देना है', tab: 'partners', params: undefined, tone: 'amber', testId: 'tile-sp-due' },
  { key: 'roomCodes', en: 'A client is asking for his room code — read it out', hi: 'क्लाइंट रूम का कोड माँग रहा है — उसे बताएँ', tab: 'clientroom', params: undefined, tone: 'amber', testId: 'tile-room-codes' },
  { key: 'roomMsgs', en: 'New messages from your clients', hi: 'आपके क्लाइंट के नए संदेश', tab: 'clientroom', params: undefined, tone: 'indigo', testId: 'tile-room-msgs' },
  { key: 'roomVisits', en: 'Clients asking to visit a property', hi: 'क्लाइंट प्रॉपर्टी देखने आना चाहते हैं', tab: 'clientroom', params: undefined, tone: 'amber', testId: 'tile-room-visits' },
  { key: 'shareAsks', en: 'A connector proposed a % share — answer', hi: 'कनेक्टर ने % हिस्सा रखा है — जवाब दें', tab: 'connector', params: undefined, tone: 'amber', testId: 'tile-share-asks' },
  { key: 'shareToPay', en: 'Connector share to work out / pay', hi: 'कनेक्टर का हिस्सा निकालना / चुकाना है', tab: 'connector', params: undefined, tone: 'emerald', testId: 'tile-share-pay' },
  { key: 'bondAlerts', en: 'Your buyer’s property was marked sold — check', hi: 'आपके खरीदार की प्रॉपर्टी बिकी दर्ज हुई — देखें', tab: 'desk', params: { sub: 'bonds' }, tone: 'amber', testId: 'tile-bond-alerts' },
  { key: 'bondAsks', en: 'Brokers asking to co-broke your buyer', hi: 'आपके खरीदार पर को-ब्रोकिंग माँग रहे ब्रोकर', tab: 'desk', params: { sub: 'bonds' }, tone: 'indigo', testId: 'tile-bond-asks' },
  { key: 'readyToPublish', en: 'Owner said yes — publish', hi: 'मालिक ने हाँ कहा — लाइव करें', tab: 'properties', params: { drafts: '1' }, tone: 'emerald' },
  { key: 'inbox', en: 'Brokers looking for what you have', hi: 'ब्रोकरों को आपकी प्रॉपर्टी चाहिए', tab: 'requirements', params: undefined, tone: 'indigo' },
  { key: 'answers', en: 'Answers to your buyer needs', hi: 'आपकी खरीदार ज़रूरत के जवाब', tab: 'requirements', params: undefined, tone: 'indigo' },
  { key: 'followUps', en: 'Client follow-ups due', hi: 'क्लाइंट फ़ॉलो-अप बाकी', tab: 'daily', params: undefined, tone: 'amber' },
  { key: 'waitingOwner', en: 'Waiting for owner’s yes', hi: 'मालिक की हाँ का इंतज़ार', tab: 'properties', params: { drafts: '1' }, tone: 'slate' },
  { key: 'protectedListings', en: 'Listings with bypass protection', hi: 'बायपास सुरक्षा वाली लिस्टिंग', tab: 'properties', params: undefined, tone: 'slate' },
  { key: 'buyerBonds', en: 'Buyers protected to you', hi: 'आपसे सुरक्षित खरीदार', tab: 'desk', params: { sub: 'bonds' }, tone: 'slate', testId: 'tile-bond' },
];

export const TODO_TAG = 'todo:';
export const todoTag = (d: Pick<TodoDef, 'key'>) => TODO_TAG + d.key;
export const isTodoLine = (x: { tag?: string }) => !!x.tag && x.tag.startsWith(TODO_TAG);

/** `/?tab=deals&view=proposals` — a path inside this app (safeInboxUrl accepts it) */
export function todoUrl(d: Pick<TodoDef, 'tab' | 'params'>): string {
  const q = new URLSearchParams({ tab: d.tab, ...(d.params || {}) });
  return '/?' + q.toString();
}

/** the words of one bell line */
export function todoWords(d: Pick<TodoDef, 'en' | 'hi'>, n: number) {
  return {
    title: d.en, body: `${n} waiting — tap to open`,
    hi: { title: d.hi, body: `${n} बाकी — खोलने के लिए दबाएँ` },
  };
}

const whole = (v: unknown) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Bring one person's "to do" lines in step with his Home counts. Mutates `all` (the whole inbox collection).
 * `newId` makes an id for a new line. Returns what changed (the server saves only when something did).
 */
export function reconcileTodos(all: InboxItem[], userId: string, counts: Record<string, unknown>, nowMs: number, newId: () => string): { added: number; updated: number; removed: number } {
  const at = new Date(nowMs).toISOString();
  let added = 0, updated = 0, removed = 0;
  for (const d of HOME_TODOS) {
    const n = whole(counts[d.key]);
    const tag = todoTag(d);
    const i = all.findIndex(x => x.userId === userId && x.tag === tag);
    if (n === 0) { if (i >= 0) { all.splice(i, 1); removed++; } continue; }
    const w = todoWords(d, n); const url = todoUrl(d);
    if (i < 0) { all.push({ id: newId(), userId, kind: 'deals', title: w.title, body: w.body, hi: w.hi, url, tag, at, n }); added++; continue; }
    const row = all[i];
    if (row.n === n && row.title === w.title && row.url === url) continue;
    const grew = n > (row.n ?? 0);
    Object.assign(row, { title: w.title, body: w.body, hi: w.hi, url, n });
    // a line the person removed comes back only when its number grows; otherwise it stays out of sight
    if (grew) { row.read = false; row.hidden = false; row.at = at; }
    updated++;
  }
  return { added, updated, removed };
}
