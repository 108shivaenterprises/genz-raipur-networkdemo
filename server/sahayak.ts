/**
 * v97 — GENZ सहायक: the helper that talks to a QR-chat customer by itself.
 *
 * It lives inside the customer's private shop-QR chat (/q/chat/<link>) — the one place where the customer is anonymous and the broker cannot yet
 * see his number. What it does, all from the app's own data (no AI service, no invented facts):
 *   • greets him and asks him to confirm his need (the same ✅ / ✏️ step the broker used to start by hand);
 *   • when he confirms, shows up to 3 LIVE homes that fit (never sold / rented / held / expired; a home added only after he scanned waits 48 h — audit F3);
 *   • answers "is it available / price / photos / more homes / call me" from the data, or hands the chat to the broker;
 *   • takes a visit request (which home, which time), checks the "no direct deal" promise is signed, and asks the broker "can you do it?";
 *   • opens the customer's client room when he taps for it, and lets him "explore" every live home that fits his need.
 * The broker can switch it off (all chats or one chat), and it keeps quiet for 30 minutes after the broker writes. Money, rates and papers are never its job.
 */
import crypto from 'crypto';
import { db } from './db.js';
import type { PartnerLead, Property, UserProfile, LeadMsg, LeadVisitReq, LeadBot } from './db.js';
import { readIntent, readNeedChange, readWhen, WHEN_CHIPS, BOT_LIMITS, type NeedChange, type When } from '../src/shared/sahayak.js';
import { containsPhone } from '../src/shared/clientRoomRules.js';
import { openRoomAuto } from './clientroom.js';
import { sealLink, openLink } from './linkSeal.js';

type Chip = { id: string; hi: string; en: string };
export interface BotDeps {
  addMsg(l: PartnerLead, m: Omit<LeadMsg, 'at'>): void;
  hist(l: PartnerLead, text: string): void;
  matchesFor(l: PartnerLead): Property[];
  needLine(l: PartnerLead): string;
  /** show the home in the chat (the number opens to the broker on the first one) */
  shareHome(l: PartnerLead, h: Property, by: 'BOT' | 'CUSTOMER'): void;
  ownerSide(l: PartnerLead): boolean;
  broker(l: PartnerLead): UserProfile | undefined;
  tellBroker(l: PartnerLead, title: string, body: string): void;
  audit(l: PartnerLead, action: string, text: string): void;
  isLive(h?: Property): boolean;
  /** put what he wrote into the lead (budget / type / area / BHK / buy-or-rent) → the words of what changed */
  applyNeed(l: PartnerLead, ch: NeedChange): string[];
  /** v98 — the city this lead is in (the shop's, else the broker's); '' when unknown. Any city of India. */
  cityOf(l: PartnerLead): string;
}

const rnd = () => crypto.randomBytes(4).toString('hex');
const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const M = {
  visit: { id: 'VISIT', hi: '📅 विज़िट चाहिए', en: 'Book a visit' } as Chip,
  more: { id: 'MORE', hi: '🔎 और घर दिखाओ', en: 'Show more homes' } as Chip,
  human: { id: 'HUMAN', hi: '💬 ब्रोकर से बात', en: 'Talk to the broker' } as Chip,
  room: { id: 'ROOM', hi: '🏠 मेरा क्लाइंट रूम', en: 'My client room' } as Chip,
  avail: { id: 'AVAIL', hi: '✅ अभी उपलब्ध है?', en: 'Still available?' } as Chip,
};

export function makeSahayak(d: BotDeps) {
  const botOf = (l: PartnerLead): LeadBot => (l.chat!.bot ||= {});
  const off = (l: PartnerLead) => !l.chat || !!l.chat.bot?.off || !!d.broker(l)?.sahayakOff || process.env.SAHAYAK === 'off';
  const quiet = (l: PartnerLead) => { const q = l.chat?.bot?.quietUntil; return !!q && Date.parse(q) > Date.now(); };
  const say = (l: PartnerLead, hi: string, en: string, chips?: Chip[]) => d.addMsg(l, { by: 'BOT', kind: chips?.length ? 'CHIPS' : 'MSG', text: hi, en, ...(chips?.length ? { chips } : {}) });
  const first = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';
  const sentIds = (l: PartnerLead) => [...new Set((l.chat?.msgs || []).filter(m => m.kind === 'HOME' && m.homeId).map(m => m.homeId!))];
  const propOf = (id: string) => st().properties.find(p => p.id === id);
  const liveSent = (l: PartnerLead) => sentIds(l).map(propOf).filter(h => d.isLive(h)) as Property[];
  const confirmed = (l: PartnerLead) => !!l.chat?.reqConfirmedAt;
  const buyerSide = (l: PartnerLead) => !d.ownerSide(l);
  const menu = (l: PartnerLead): Chip[] => { const m = [M.visit, M.more]; if (l.chat?.revealedAt && !botOf(l).roomId && buyerSide(l)) m.push(M.room); m.push(M.human); return m; };
  const price = (h: Property) => { const p = Number(h.askingPrice) || 0; return p >= 1e7 ? `₹${(p / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr` : p >= 1e5 ? `₹${(p / 1e5).toFixed(2).replace(/\.?0+$/, '')} लाख` : `₹${p.toLocaleString('en-IN')}`; };

  /** the first thing he sees: who this is, and his need to confirm (the ✅ / ✏️ card) */
  function welcome(l: PartnerLead) {
    if (off(l) || !l.chat) return;
    const b = d.broker(l); const who = b?.name || 'ब्रोकर'; const owner = d.ownerSide(l);
    say(l, `नमस्ते ${first(l.name)}! 👋 मैं GENZ सहायक हूँ — ${who} का डिजिटल साथी। ${owner ? 'आपकी प्रॉपर्टी की जानकारी मैंने नोट कर ली है' : 'आपकी ज़रूरत मैंने नोट कर ली है'}। नीचे देख लें — सही हो तो ✅ दबाएँ, कुछ बदलना हो तो ✏️।`,
      `Hello ${first(l.name)}! I am the GENZ assistant — ${who}'s digital helper. I have noted ${owner ? 'your property details' : 'your need'}. Check below — tap ✅ if it is right, ✏️ to change something.`);
    l.chat.reqAskedAt = nowIso(); d.addMsg(l, { by: 'BOT', kind: 'ASK', text: d.needLine(l) });
    d.hist(l, 'The GENZ assistant started the chat and asked him to confirm his need');
  }

  /** show up to 3 live homes that fit and have not been shown yet. Returns how many were shown. */
  function showHomes(l: PartnerLead, by: 'BOT' | 'CUSTOMER' = 'BOT', why: 'first' | 'more' = 'more'): number {
    const sent = sentIds(l); const pick = d.matchesFor(l).filter(h => !sent.includes(h.id)).slice(0, BOT_LIMITS.autoHomes);
    if (!pick.length) {
      if (!sent.length) {
        say(l, 'अभी आपकी ज़रूरत से मेल खाता कोई घर उपलब्ध नहीं है। मैंने ब्रोकर को बता दिया है — नया घर आते ही यहीं दिखा दूँगा। आप चाहें तो ✏️ लिखकर ज़रूरत बदल भी सकते हैं (जैसे “बजट 60 लाख”).',
          'No live home matches your need right now. I have told the broker — I will show a new one here as soon as it comes. You can also write a change (for example “budget 60 lakh”).', [M.human]);
        const b = botOf(l); b.needsBroker = 'no-match';
        d.tellBroker(l, `🔎 ${l.name}: मेल खाता घर नहीं`, `${d.needLine(l)} — आपकी कोई live लिस्टिंग इससे मेल नहीं खाती। नई लिस्टिंग जोड़ें।`);
      } else say(l, 'अभी इससे ज़्यादा मेल खाते घर नहीं हैं। नया घर आते ही बता दूँगा। 🙏', 'No more matching homes right now. I will tell you when a new one comes.', menu(l));
      return 0;
    }
    for (const h of pick) d.shareHome(l, h, by);
    const n = pick.length;
    say(l, `✅ आपकी ज़रूरत से मेल खाते ${n} ${n === 1 ? 'घर' : 'घर'} ऊपर भेजे हैं — ये अभी उपलब्ध हैं (बिके या किराये पर गए घर मैं नहीं दिखाता)। पसंद आए तो 📅 विज़िट चुनें।`,
      `I have sent ${n} matching home${n === 1 ? '' : 's'} above — they are available right now (I never show a sold or rented home). If you like one, choose 📅 visit.`, menu(l));
    if (why === 'first' || !l.chat!.revealedAt) d.tellBroker(l, `🤖 ${l.name}: ज़रूरत पक्की`, `सहायक ने ${n} मेल खाते घर भेजे — अब उसका नंबर आपको दिखेगा।`);
    else d.tellBroker(l, `🤖 ${l.name}: ${n} और घर भेजे`, 'सहायक ने चैट में नए मेल खाते घर दिखाए।');
    return n;
  }

  /** he tapped ✅ on his need */
  function onConfirmed(l: PartnerLead) {
    if (off(l) || !l.chat) return;
    if (d.ownerSide(l)) {
      say(l, 'धन्यवाद! जानकारी पक्की हो गई। ब्रोकर जल्द आपसे यहीं बात करेंगे।', 'Thank you! The details are confirmed. The broker will talk to you here soon.', [M.human]);
      d.tellBroker(l, `🤖 ${l.name}: जानकारी पक्की`, 'मालिक ने प्रॉपर्टी की जानकारी पक्की की — उसका नंबर अब दिख रहा है।'); return;
    }
    showHomes(l, 'BOT', 'first');
  }

  /** he tapped ✏️ and wrote a change: apply what can be read, ask him to confirm again */
  function onEdit(l: PartnerLead, text: string) {
    if (off(l) || !l.chat) return;
    const ch = readNeedChange(text, d.cityOf(l)); const changed = d.applyNeed(l, ch);
    if (changed.length) {
      l.chat.reqConfirmedAt = undefined; l.chat.reqAskedAt = nowIso();
      say(l, `समझ गया — मैंने आपकी ज़रूरत बदल दी (${changed.join(', ')}). नीचे देखकर ✅ दबाएँ।`, `Got it — I updated your need (${changed.join(', ')}). Check below and tap ✅.`);
      d.addMsg(l, { by: 'BOT', kind: 'ASK', text: d.needLine(l) });
    } else {
      l.chat.reqAskedAt = undefined;
      say(l, 'आपका बदलाव ब्रोकर को भेज दिया है — वे ज़रूरत सही करके आपसे पूछेंगे। (मैं बजट, इलाका, BHK और घर का प्रकार खुद समझ लेता हूँ — जैसे “2BHK, ' + (l.locality || 'आपका इलाका') + ', 15000 किराया”.)',
        'I have sent your change to the broker — he will fix your need and ask you again. (I can read budget, area, BHK and type myself — for example “2BHK, ' + (l.locality || 'your area') + ', 15000 rent”.)', [M.human]);
      botOf(l).needsBroker = 'need-change';
    }
  }

  function remindConfirm(l: PartnerLead) {
    say(l, 'पहले ऊपर अपनी ज़रूरत ✅ पक्की कर दें — फिर मैं तुरंत मेल खाते घर दिखाता हूँ।', 'First confirm your need above with ✅ — then I show matching homes straight away.');
  }

  function startVisit(l: PartnerLead, homeId?: string) {
    const b = botOf(l);
    if (d.ownerSide(l)) { say(l, 'ब्रोकर आपसे मिलने का समय आपके साथ तय करेंगे — मैंने उन्हें बता दिया है।', 'The broker will fix a meeting time with you — I have told him.', [M.human]); d.tellBroker(l, `📅 ${l.name} मिलना चाहते हैं`, 'मालिक ने मिलने के लिए कहा।'); return; }
    if (!confirmed(l)) return remindConfirm(l);
    let homes = liveSent(l);
    if (!homes.length) { showHomes(l, 'BOT', 'more'); homes = liveSent(l); if (!homes.length) return; }
    const open = (b.visits || []).filter(v => v.status === 'ASKED' || v.status === 'COUNTER').length;
    if (open >= BOT_LIMITS.visitsOpen) { say(l, 'आपकी कई विज़िट रिक्वेस्ट अभी ब्रोकर के पास हैं। उनके जवाब के बाद नई रिक्वेस्ट भेजिए।', 'Several of your visit requests are with the broker. Send a new one after he answers.'); return; }
    const hid = homeId && homes.some(h => h.id === homeId) ? homeId : homes.length === 1 ? homes[0].id : '';
    if (!hid) {
      b.awaiting = 'HOME';
      say(l, 'किस घर की विज़िट चाहिए?', 'Which home do you want to visit?', homes.slice(0, 4).map(h => ({ id: `VISITH:${h.id}`, hi: `🏠 ${h.title.slice(0, 30)}`, en: `🏠 ${h.title.slice(0, 30)}` })));
      return;
    }
    b.pendingHome = hid;
    // the "no direct deal" promise (v64): a buyer / renter who came by the QR form has already signed it; anyone else signs it here before the broker is asked
    if (!l.promise) { b.awaiting = 'PROMISE'; say(l, 'विज़िट से पहले एक छोटा वचन ज़रूरी है — नीचे के कार्ड में टिक करके अपना नाम लिखें।', 'A short promise is needed before a visit — tick it and type your name in the card below.'); return; }
    askWhen(l);
  }
  function askWhen(l: PartnerLead) {
    const b = botOf(l); b.awaiting = 'WHEN';
    say(l, 'कब आना चाहेंगे? नीचे चुनें — या अपना समय लिखें (जैसे “कल शाम 5 बजे”).', 'When would you like to come? Pick below — or write your own time (for example “tomorrow 5 pm”).',
      WHEN_CHIPS.map(c => ({ id: `WHEN:${c.id}`, hi: c.hi, en: c.en })));
  }

  /** the time is known → the visit request goes to the broker */
  function book(l: PartnerLead, homeId: string, w: When) {
    const b = botOf(l); const h = propOf(homeId);
    b.awaiting = undefined; b.pendingHome = undefined;
    if (!d.isLive(h)) { say(l, 'माफ़ कीजिए, यह घर अब उपलब्ध नहीं है। दूसरा घर देखें?', 'Sorry, this home is no longer available. Shall I show another?', menu(l)); return; }
    if ((b.visits || []).some(v => v.homeId === homeId && (v.status === 'ASKED' || v.status === 'COUNTER'))) { say(l, 'इस घर की विज़िट रिक्वेस्ट पहले से ब्रोकर के पास है — जवाब का इंतज़ार करें। 🙏', 'A visit request for this home is already with the broker — please wait for the answer.'); return; }
    const v: LeadVisitReq = { id: `LVR-${rnd()}`, at: nowIso(), homeId, title: h!.title.slice(0, 120), preferred: w.hi, preferredEn: w.en, ...(w.iso ? { whenIso: w.iso } : {}), status: 'ASKED' };
    (b.visits ||= []).push(v);
    d.addMsg(l, { by: 'BOT', kind: 'VISIT', vid: v.id, text: `📅 विज़िट रिक्वेस्ट भेज दी: ${v.title} · ${w.hi}। ब्रोकर आपका समय देखकर यहीं बताएँगे (अलर्ट चालू हों तो फ़ोन पर भी)।`, en: `Visit request sent: ${v.title} · ${w.en}. The broker will check your time and answer here (and on your phone if alerts are on).`, title: v.title, homeId });
    d.hist(l, `Asked for a visit to “${v.title}” — preferred: ${w.en}`);
    d.audit(l, 'SHOP_LEAD_VISIT_ASKED', `Visit request from the chat (${homeId}, preferred “${w.en}”) — the broker was asked whether he can schedule it`);
    d.tellBroker(l, `📅 ${l.name}: विज़िट रिक्वेस्ट`, `${v.title} · ${w.en}. क्या आप तय कर सकते हैं? ऐप में “हाँ / दूसरा समय / नहीं” चुनें।`);
  }

  /** is each home he was shown still there? (sold / rented / held homes are said plainly, and a replacement is offered) */
  function availReport(l: PartnerLead) {
    const ids = sentIds(l);
    if (!ids.length) { if (!confirmed(l)) return remindConfirm(l); showHomes(l); return; }
    const lines: string[] = []; const en: string[] = []; let gone = 0;
    for (const id of ids.slice(-6)) {
      const h = propOf(id); const t = h?.title || id;
      if (d.isLive(h)) { const s = h!.listingStatus === 'under_negotiation' ? ['⏳ बातचीत में है', 'in talks'] : ['✅ उपलब्ध है', 'available']; lines.push(`• ${t} — ${s[0]}`); en.push(`• ${t} — ${s[1]}`); }
      else { gone++; const s = !h ? ['❌ अब लिस्ट में नहीं', 'no longer listed'] : h.listingStatus === 'sold' ? ['❌ बिक चुका है', 'sold'] : h.listingStatus === 'rented' ? ['❌ किराये पर जा चुका है', 'rented out'] : ['⚠️ अभी उपलब्ध नहीं', 'not available now']; lines.push(`• ${t} — ${s[0]}`); en.push(`• ${t} — ${s[1]}`); }
    }
    say(l, `अभी की स्थिति:\n${lines.join('\n')}`, `Status right now:\n${en.join('\n')}`, menu(l));
    if (gone) showHomes(l);
  }

  function handoff(l: PartnerLead, why: string, line?: [string, string]) {
    const b = botOf(l); b.handoffAt = nowIso(); b.quietUntil = new Date(Date.now() + BOT_LIMITS.handoffHours * 3600_000).toISOString(); b.needsBroker = why;
    say(l, line?.[0] || 'ठीक है 🙏 मैंने ब्रोकर को बुला लिया है — वे जल्द यहीं जवाब देंगे। (नंबर इस चैट में नहीं लिखे जाते; ब्रोकर आपसे खुद संपर्क करेंगे।)', line?.[1] || 'Okay 🙏 I have called the broker — he will reply here soon. (Numbers cannot be typed in this chat; the broker will reach you himself.)');
    d.tellBroker(l, `🙋 ${l.name} आपसे बात करना चाहते हैं`, why === 'photos' ? 'फ़ोटो / वीडियो माँगे हैं।' : why === 'price' ? 'रेट / मोलभाव पर बात करना चाहते हैं।' : why === 'human' ? 'ग्राहक ने खुद आपसे बात करने को कहा।' : 'सहायक उनके सवाल का जवाब नहीं दे पाया।');
  }

  function openRoom(l: PartnerLead) {
    const b = botOf(l);
    if (!buyerSide(l)) return;
    if (!l.chat!.revealedAt) { say(l, 'क्लाइंट रूम तब बनता है जब आपकी ज़रूरत पक्की हो और आपको कोई घर भेजा जा चुका हो।', 'A client room opens once your need is confirmed and a home has been sent to you.'); return; }
    if (b.roomSealed) { say(l, 'आपका क्लाइंट रूम तैयार है — नीचे के कार्ड से खोलें।', 'Your client room is ready — open it from the card below.'); return; }
    const r = openRoomAuto(l.brokerId, { name: l.name, phone: l.phone, kind: l.kind === 'RENT_IN' ? 'RENTER' : 'BUYER', note: `Shop QR lead ${l.id} · opened by the GENZ assistant on his tap`, propertyIds: sentIds(l) });
    if (!r.ok) {
      if (r.code === 'EXISTS') { say(l, 'आपका क्लाइंट रूम ब्रोकर के पास पहले से है — मैंने उन्हें कहा है कि आपको उसका लिंक भेजें।', 'The broker already has a client room for you — I have asked him to send you its link.'); d.tellBroker(l, `🏠 ${l.name} को रूम का लिंक चाहिए`, 'उसने चैट में क्लाइंट रूम माँगा — रूम खोलकर “नया लिंक” भेजें।'); }
      else { say(l, 'अभी क्लाइंट रूम नहीं बन पाया — ब्रोकर इसे देख लेंगे।', 'I could not open the client room right now — the broker will look into it.'); d.tellBroker(l, `🏠 ${l.name}: रूम नहीं बन पाया`, r.error); }
      return;
    }
    b.roomId = r.room.id; b.roomSealed = sealLink(r.token, `lr|${l.id}`); b.roomAt = nowIso();
    d.audit(l, 'SHOP_LEAD_ROOM_OPENED', `Client room ${r.room.id} opened by the GENZ assistant after the customer tapped for it (${r.room.items.length} home(s) put in)`);
    d.hist(l, `Client room opened by the assistant on his tap (${r.room.items.length} homes)`);
    say(l, '🏠 आपका क्लाइंट रूम तैयार है — इसमें अभी तक भेजे गए सारे घर हैं, फ़ोटो-वीडियो आने पर वहीं मिलेंगे। नीचे के कार्ड से खोलें (अपना मोबाइल नंबर + कोड से)।', '🏠 Your client room is ready — all the homes sent so far are in it, and photos / videos will come there. Open it from the card below (with your mobile number + a code).');
    d.tellBroker(l, `🏠 ${l.name} का क्लाइंट रूम खुला`, 'सहायक ने ग्राहक के कहने पर रूम बनाया। कोड ग्राहक के फ़ोन पर SMS से जाता है।');
  }

  /** the customer's own words */
  function onText(l: PartnerLead, text: string) {
    if (!l.chat) return;
    const b = botOf(l); const intent = readIntent(text);
    if (intent === 'HUMAN') { b.awaiting = undefined; if (!off(l)) handoff(l, 'human'); return; }
    // a question the bot asked him is answered even while it is "quiet" (he started the flow)
    if (b.awaiting === 'WHEN' && b.pendingHome) {
      const w = readWhen(text);
      if (w) return book(l, b.pendingHome, w);
      say(l, 'समय समझ नहीं आया 🙏 — जैसे “कल शाम 5 बजे” या “रविवार सुबह” लिखें, या नीचे चुनें।', 'I could not read the time 🙏 — write for example “tomorrow 5 pm” or “Sunday morning”, or pick below.', WHEN_CHIPS.map(c => ({ id: `WHEN:${c.id}`, hi: c.hi, en: c.en })));
      return;
    }
    if (b.awaiting === 'PROMISE') { say(l, 'विज़िट से पहले ऊपर के कार्ड में वचन टिक करके नाम लिखें।', 'Before the visit, tick the promise and type your name in the card above.'); return; }
    if (off(l) || quiet(l)) return;
    switch (intent) {
      case 'GREET': if (!confirmed(l)) return remindConfirm(l); return say(l, `नमस्ते ${first(l.name)}! 👋 बताइए, क्या मदद करूँ?`, `Hello ${first(l.name)}! 👋 How can I help?`, menu(l));
      case 'THANKS': return say(l, 'आपका स्वागत है 🙏 कोई भी सवाल हो तो यहीं लिखिए।', 'You are welcome 🙏 Write here for any question.', menu(l));
      case 'VISIT': return startVisit(l);
      case 'MORE': if (!confirmed(l)) return remindConfirm(l); if (d.ownerSide(l)) return handoff(l, 'other'); showHomes(l); return;
      case 'AVAIL': return availReport(l);
      case 'PHOTOS': return handoff(l, 'photos', ['फ़ोटो / वीडियो ब्रोकर आपको यहीं भेजेंगे — मैंने उन्हें बता दिया है। 📷', 'The broker will send photos / videos here — I have told him. 📷']);
      case 'PRICE': {
        const hs = liveSent(l).slice(0, 4);
        const list = hs.length ? `\nलिस्टेड कीमत:\n${hs.map(h => `• ${h.title} — ${price(h)}`).join('\n')}` : '';
        const listEn = hs.length ? `\nListed price:\n${hs.map(h => `• ${h.title} — ${price(h)}`).join('\n')}` : '';
        return handoff(l, 'price', [`रेट और मोलभाव पर ब्रोकर आपसे खुद बात करेंगे — मैंने उन्हें बता दिया है।${list}`, `The broker will talk to you himself about the rate and any negotiation — I have told him.${listEn}`]);
      }
      case 'NEED': {
        const ch = readNeedChange(text, d.cityOf(l)); const changed = d.applyNeed(l, ch);
        if (!changed.length) return fallback(l);
        if (!l.chat.revealedAt) {
          l.chat.reqConfirmedAt = undefined; l.chat.reqAskedAt = nowIso();
          say(l, `समझ गया — आपकी ज़रूरत अब ये है (${changed.join(', ')} बदला). सही हो तो ✅ दबाएँ।`, `Understood — your need is now this (${changed.join(', ')} changed). Tap ✅ if it is right.`);
          d.addMsg(l, { by: 'BOT', kind: 'ASK', text: d.needLine(l) });
        } else {
          l.chat.reqText = d.needLine(l);
          say(l, `ज़रूरत अपडेट कर दी: ${d.needLine(l)}। नए मेल खाते घर देखता हूँ…`, `Need updated: ${d.needLine(l)}. Looking for new matching homes…`);
          d.hist(l, `Changed his need in the chat (${changed.join(', ')})`);
          showHomes(l);
        }
        return;
      }
      default: return fallback(l);
    }
  }
  function fallback(l: PartnerLead) {
    const b = botOf(l);
    if (b.lastFallbackAt && Date.now() - Date.parse(b.lastFallbackAt) < 20 * 60_000) return;   // one "I passed it on" per 20 minutes — never a wall of bot talk
    b.lastFallbackAt = nowIso(); b.needsBroker ||= 'other';
    say(l, 'आपका संदेश मैंने ब्रोकर को भेज दिया है — वे खुद जवाब देंगे। तब तक आप ये कर सकते हैं:', 'I have passed your message to the broker — he will reply himself. Meanwhile you can:', confirmed(l) ? menu(l) : [M.human]);
    d.tellBroker(l, `💬 ${l.name} ने लिखा`, 'सहायक इस सवाल का जवाब नहीं दे सका — आप जवाब दें।');
  }

  /** a one-tap answer */
  function onChip(l: PartnerLead, k: string): void {
    if (!l.chat) return;
    const b = botOf(l); const key = String(k || '').slice(0, 60); const [head, arg] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)];
    const label = (c?: Chip) => c ? c.hi : '';
    const echo = (txt: string) => d.addMsg(l, { by: 'CUSTOMER', kind: 'ANSWER', text: txt });
    switch (head) {
      case 'VISIT': echo(label(M.visit)); return startVisit(l);
      case 'MORE': echo(label(M.more)); if (!confirmed(l)) return remindConfirm(l); if (d.ownerSide(l)) return handoff(l, 'other'); showHomes(l); return;
      case 'AVAIL': echo(label(M.avail)); return availReport(l);
      case 'HUMAN': echo(label(M.human)); return handoff(l, 'human');
      case 'ROOM': echo(label(M.room)); return openRoom(l);
      case 'VISITH': { if (!sentIds(l).includes(arg)) return; const h = propOf(arg); echo(`🏠 ${h?.title || arg}`); return startVisit(l, arg); }
      case 'WHEN': {
        const c = WHEN_CHIPS.find(x => x.id === arg); if (!c || !b.pendingHome) return;
        const w = readWhen(c.say); if (!w) return; echo(`🕐 ${c.hi}`); return book(l, b.pendingHome, w);
      }
      case 'VOK': {
        const v = (b.visits || []).find(x => x.id === arg); if (!v || v.status !== 'COUNTER') return;
        v.status = 'OK'; v.answeredAt = nowIso(); v.preferred = v.counter || v.preferred; echo(`✔ ठीक है — ${v.preferred}`);
        say(l, `तय हो गया ✅ ${v.title} · ${v.preferred}। ब्रोकर आपसे यहीं पक्का करेंगे।`, `Settled ✅ ${v.title} · ${v.preferred}. The broker will confirm with you here.`);
        d.tellBroker(l, `✔ ${l.name} ने समय मान लिया`, `${v.title} · ${v.preferred} — अब विज़िट बुक करें।`); d.hist(l, `Accepted the visit time “${v.preferred}” for “${v.title}”`); return;
      }
      case 'VAGAIN': {
        const v = (b.visits || []).find(x => x.id === arg); if (!v || v.status !== 'COUNTER') return;
        v.status = 'NO'; v.answeredAt = nowIso(); echo('🕐 मेरा दूसरा समय'); b.pendingHome = v.homeId; return askWhen(l);
      }
      default: return;
    }
  }

  /** the promise card (typed name + tick) */
  function onPromise(l: PartnerLead, signName: string, promise: NonNullable<PartnerLead['promise']>) {
    const b = botOf(l); l.promise = promise;
    d.hist(l, `Agreed “no direct deal” (wording ${promise.version}) and signed as “${promise.signName}” — before a visit request`);
    d.audit(l, 'SHOP_LEAD_PROMISE', `The customer signed the no-direct-deal promise ${promise.version} in the chat before a visit request`);
    if (b.awaiting === 'PROMISE' && b.pendingHome) { d.addMsg(l, { by: 'CUSTOMER', kind: 'ANSWER', text: `✍️ वचन दिया — ${signName}` }); askWhen(l); }
  }

  /** the broker answers a visit request */
  function brokerReply(l: PartnerLead, vid: string, action: string, text: string, brokerName: string): { ok: true; push: boolean } | { ok: false; error: string; status?: number } {
    const b = botOf(l); const v = (b.visits || []).find(x => x.id === vid);
    if (!v) return { ok: false, error: 'Visit request not found', status: 404 };
    if (v.status === 'DONE') return { ok: false, error: 'This visit is already done', status: 409 };
    const who = first(brokerName) || 'ब्रोकर';
    if (action === 'OK') {
      v.status = 'OK'; v.answeredAt = nowIso();
      d.addMsg(l, { by: 'BROKER', kind: 'MSG', text: `✔ ठीक है — ${v.counter || v.preferred} पर “${v.title}” दिखाएँगे। विज़िट का कोड मैं यहीं भेजूँगा/भेजूँगी।`, vid: v.id });
      d.hist(l, `Broker agreed to the visit (${v.counter || v.preferred})`);
    } else if (action === 'COUNTER') {
      const t = String(text || '').trim().slice(0, 80);
      if (t.length < 3) return { ok: false, error: 'Write the time you can do (for example “Sunday 11 am”)' };
      if (containsPhone(t)) return { ok: false, error: 'Do not write a phone number' };
      v.status = 'COUNTER'; v.counter = t; v.answeredAt = nowIso();
      d.addMsg(l, { by: 'BOT', kind: 'CHIPS', vid: v.id, text: `${who} ने दूसरा समय सुझाया: ${t}। क्या यह ठीक है?`, en: `${who} suggested another time: ${t}. Is that fine?`, chips: [{ id: `VOK:${v.id}`, hi: '✔ ठीक है', en: 'Fine' }, { id: `VAGAIN:${v.id}`, hi: '🕐 मेरा दूसरा समय', en: 'My other time' }] });
      d.hist(l, `Broker suggested another visit time: ${t}`);
    } else if (action === 'NO') {
      v.status = 'NO'; v.answeredAt = nowIso(); b.pendingHome = v.homeId;
      d.addMsg(l, { by: 'BROKER', kind: 'MSG', text: `इस समय संभव नहीं है 🙏 कृपया कोई दूसरा समय बताइए।`, vid: v.id });
      b.awaiting = 'WHEN';
      d.addMsg(l, { by: 'BOT', kind: 'CHIPS', text: 'नीचे से समय चुनें या अपना समय लिखें।', en: 'Pick a time below or write your own.', chips: WHEN_CHIPS.map(c => ({ id: `WHEN:${c.id}`, hi: c.hi, en: c.en })) });
      d.hist(l, 'Broker could not do that visit time');
    } else return { ok: false, error: 'Choose yes / another time / no' };
    b.needsBroker = undefined; b.quietUntil = new Date(Date.now() + BOT_LIMITS.quietMinutes * 60_000).toISOString();
    return { ok: true, push: true };
  }

  /** the broker wrote himself: the assistant keeps quiet for a while */
  function brokerSaid(l: PartnerLead) { const b = botOf(l); b.quietUntil = new Date(Date.now() + BOT_LIMITS.quietMinutes * 60_000).toISOString(); b.needsBroker = undefined; }

  /** the homes he may browse (Explore) = the live homes that fit, with whether each was already sent */
  function explore(l: PartnerLead): { h: Property; sent: boolean }[] {
    const sent = new Set(sentIds(l));
    const pool = new Map<string, Property>();
    for (const h of d.matchesFor(l)) pool.set(h.id, h);
    for (const h of liveSent(l)) pool.set(h.id, h);
    return [...pool.values()].slice(0, BOT_LIMITS.exploreHomes).map(h => ({ h, sent: sent.has(h.id) }));
  }
  /** he liked a home on the Explore page */
  function like(l: PartnerLead, homeId: string, wantVisit: boolean): boolean {
    const row = explore(l).find(x => x.h.id === homeId); if (!row || !confirmed(l) || d.ownerSide(l)) return false;
    if (!row.sent) d.shareHome(l, row.h, 'CUSTOMER');
    d.addMsg(l, { by: 'CUSTOMER', kind: 'ANSWER', text: `👍 पसंद आया: ${row.h.title}` });
    d.tellBroker(l, `👍 ${l.name}: घर पसंद आया`, `${row.h.title} (Explore से).`);
    if (wantVisit && !off(l)) startVisit(l, homeId);
    else if (!off(l)) say(l, `👍 “${row.h.title}” मैंने ब्रोकर को बता दिया। विज़िट चाहिए तो नीचे दबाएँ।`, `👍 I told the broker you like “${row.h.title}”. Tap below for a visit.`, [M.visit, M.more, M.human]);
    return true;
  }

  const roomLink = (l: PartnerLead) => { const s = l.chat?.bot?.roomSealed; if (!s) return ''; try { return openLink(s, `lr|${l.id}`); } catch { return ''; } };
  const view = (l: PartnerLead) => { const b = l.chat?.bot || {}; return { on: !off(l), offByLead: !!b.off, offByBroker: !!d.broker(l)?.sahayakOff, quiet: quiet(l), needsBroker: b.needsBroker || null, visits: (b.visits || []).slice(-6), room: !!b.roomId }; };

  return { welcome, onConfirmed, onEdit, onText, onChip, onPromise, brokerReply, brokerSaid, explore, like, roomLink, sentIds, view, off, startVisit, showHomes };
}
export type Sahayak = ReturnType<typeof makeSahayak>;
