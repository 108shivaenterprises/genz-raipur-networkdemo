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
import { readIntent, readNeedChange, readWhen, WHEN_CHIPS, BOT_LIMITS, BOT_WATCH, GONE_WORDS, goneKind, type GoneKind, type NeedChange, type When } from '../src/shared/sahayak.js';
import { nextAsk, applyAnswer, progress, composeListing, summaryLine, SKIP_CHIP, type AskId } from '../src/shared/listingAsk.js';
import { containsContact } from '../src/shared/clientRoomRules.js';
import { openRoomAuto, addRoomHomes, syncRoomMessagesFromLead, releaseRoom } from './clientroom.js';
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
  /** v104 — how many PUBLIC photos / videos a home has for an anonymous customer (the same set the preview page shows) */
  media(h: Property): { photos: number; videos: number };
  /** v103 — a phone alert to the customer (his name-less lock-screen words: “GENZ सहायक sent a property / a message”) */
  ping(l: PartnerLead, what: 'MSG' | 'HOME'): void;
  /** put what he wrote into the lead (budget / type / area / BHK / buy-or-rent) → the words of what changed */
  applyNeed(l: PartnerLead, ch: NeedChange): string[];
  /** v101 — search the NETWORK (other brokers' live homes) for his need: makes / updates his buyer need and returns how many homes there are and their price range; null = no budget yet / not a buyer */
  networkScan(l: PartnerLead): { count: number; min: number; max: number; reqId: string } | null;
  /** v98 — the city this lead is in (the shop's, else the broker's); '' when unknown. Any city of India. */
  cityOf(l: PartnerLead): string;
  /** v99 — what the QR form already told us about an OWNER's property (type, sale / rent, place, price, name, number) */
  ownerFacts(l: PartnerLead): Record<string, any>;
  /** v99 — put the gathered facts in the broker's Drafts (one per owner + place) */
  saveDraft(l: PartnerLead, fields: Record<string, any>): { id: string; missing: string[]; created: boolean; locked: boolean } | { error: string };
  /** v99 — where the owner's listing stands now (draft → consent asked → agreed → live) */
  draftState(l: PartnerLead): { draftId: string; status: string; missing: number; propertyId?: string; propertyStatus?: string } | null;
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
  info: { id: 'ASKGO', hi: '📝 जानकारी पूरी करें', en: 'Finish the details' } as Chip,
  status: { id: 'STATUS', hi: '📋 मेरी लिस्टिंग कहाँ तक पहुँची?', en: 'Where is my listing?' } as Chip,
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
  const menu = (l: PartnerLead): Chip[] => { if (d.ownerSide(l)) { const iv = l.chat?.bot?.interview; return [...(iv && !iv.doneAt ? [M.info] : [M.status]), M.human]; } const m = [M.visit, M.more]; if (l.chat?.revealedAt && !botOf(l).roomId && buyerSide(l)) m.push(M.room); m.push(M.human); return m; };
  const price = (h: Property) => { const p = Number(h.askingPrice) || 0; return p >= 1e7 ? `₹${(p / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr` : p >= 1e5 ? `₹${(p / 1e5).toFixed(2).replace(/\.?0+$/, '')} लाख` : `₹${p.toLocaleString('en-IN')}`; };

  /** the Hindi words applyNeed returns for what changed → the same in English (the English line of a bot message never carries Hindi words) */
const CH_EN: Record<string, string> = { 'खरीदना': 'buy', 'किराया': 'rent', 'बजट': 'budget', 'प्रकार': 'type', 'शहर': 'city', 'इलाका': 'area', 'BHK': 'BHK' };
const chEn = (c: string[]) => c.map(x => CH_EN[x] || x).join(', ');
const rsHi = (n: number) => n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} करोड़` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} लाख` : `₹${Math.round(n).toLocaleString('en-IN')}`;
  const rsEn = (n: number) => n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`;
  /** v101 — he confirmed (or changed) his need: search the NETWORK for it and tell him how many homes the network holds and their price range — never which homes, where, or whose.
   *  The same step makes his buyer need for the broker (number still hidden), so the network search and Magic Match work even before any home of the broker's own fits. Told once per result. */
  function networkNote(l: PartnerLead): void {
    if (off(l) || !l.chat || !buyerSide(l)) return;
    const b = botOf(l); const who = d.broker(l)?.name || 'ब्रोकर';
    const n = d.networkScan(l);
    if (!n) {
      if (!b.askedBudget) { b.askedBudget = true; say(l, 'अपना बजट भी लिख दें (जैसे “बजट 60 लाख”) — तब मैं पूरे नेटवर्क में आपके लिए घर खोज सकूँगा। 🔎', 'Please write your budget too (for example “budget 60 lakh”) — then I can search the whole network for you. 🔎'); }
      return;
    }
    const key = `${n.count}|${n.min}|${n.max}|${d.needLine(l)}`; if (b.network?.toldKey === key) return;
    if (b.network) b.network.toldKey = key;
    if (n.count > 0) {
      const same = n.min === n.max;
      say(l, `🌐 GENZ नेटवर्क में आपके लिए ${n.count} प्रॉपर्टी उपलब्ध ${n.count === 1 ? 'है' : 'हैं'} — कीमत ${same ? rsHi(n.min) : `${rsHi(n.min)} से ${rsHi(n.max)} तक`}। ${who} आपकी तरफ़ से इन ब्रोकरों से बात कर रहे हैं; जो घर आपके लायक होंगे वो यहीं भेजे जाएँगे।`,
        `🌐 The GENZ network has ${n.count} propert${n.count === 1 ? 'y' : 'ies'} for you — priced ${same ? rsEn(n.min) : `${rsEn(n.min)} to ${rsEn(n.max)}`}. ${who} is talking to those brokers on your behalf; the homes worth your time will be sent here.`);
      d.hist(l, `Network search for his need: ${n.count} home(s), ${rsEn(n.min)}–${rsEn(n.max)} — he was told the count and range only`);
    } else d.hist(l, 'Network search for his need: nothing yet — his need stays saved, the broker is alerted when a home fits');   // nothing to tell him: the "no home right now" line (or his homes) follows
  }

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
    const all = d.matchesFor(l); botOf(l).seen = all.map(h => h.id);   // v103 — every home that fits NOW is known to the assistant; only a home that is not in this list counts as "new" later
    const sent = sentIds(l); const pick = all.filter(h => !sent.includes(h.id)).slice(0, BOT_LIMITS.autoHomes);
    if (!pick.length) {
      if (!sent.length) {
        const b = botOf(l); const nw = b.network?.count || 0; const who = d.broker(l)?.name || 'ब्रोकर';
        if (nw > 0) say(l, `${who} के अपने घरों में अभी सीधा मेल नहीं है — पर ऊपर बताए नेटवर्क के घरों पर वे काम कर रहे हैं। नया घर आते ही यहीं दिखा दूँगा। आप चाहें तो ज़रूरत बदलकर भी लिख सकते हैं (जैसे “बजट 60 लाख”)।`,
          `${who} has no home of his own that fits right now — but he is working on the network homes mentioned above. I will show a new one here as soon as it comes. You can also write a change (for example “budget 60 lakh”).`, [M.human]);
        else say(l, 'अभी आपकी ज़रूरत से मेल खाता कोई घर उपलब्ध नहीं है। मैंने ब्रोकर को बता दिया है — नया घर आते ही यहीं दिखा दूँगा। आप चाहें तो लिखकर ज़रूरत बदल भी सकते हैं (जैसे “बजट 60 लाख”, “शंकर नगर में चाहिए”)।',
          'No live home matches your need right now. I have told the broker — I will show a new one here as soon as it comes. You can also write a change (for example “budget 60 lakh”, “I want it in Shankar Nagar”).', [M.human]);
        b.needsBroker = 'no-match';
        d.tellBroker(l, `🔎 ${l.name}: मेल खाता घर नहीं`, `${d.needLine(l)} — आपकी कोई live लिस्टिंग इससे मेल नहीं खाती${nw > 0 ? `, पर नेटवर्क में ${nw} घर हैं — Buyers / Match Center में देखें` : ''}। ${nw > 0 ? '' : 'नई लिस्टिंग जोड़ें।'}`);
      } else say(l, 'अभी इससे ज़्यादा मेल खाते घर नहीं हैं। नया घर आते ही बता दूँगा। 🙏', 'No more matching homes right now. I will tell you when a new one comes.', menu(l));
      return 0;
    }
    for (const h of pick) d.shareHome(l, h, by);
    const n = pick.length;
    say(l, `✅ आपकी ज़रूरत से मेल खाते ${n} ${n === 1 ? 'घर' : 'घर'} ऊपर भेजे हैं — ये अभी उपलब्ध हैं (बिके या किराये पर गए घर मैं नहीं दिखाता)। पसंद आए तो 📅 विज़िट चुनें।`,
      `I have sent ${n} matching home${n === 1 ? '' : 's'} above — they are available right now (I never show a sold or rented home). If you like one, choose 📅 visit.`, menu(l));
    autoRoom(l);   // v101 — his number is open now: the client room opens by itself (it needs his number)
    if (why === 'first' || !l.chat!.revealedAt) d.tellBroker(l, `🤖 ${l.name}: ज़रूरत पक्की`, `सहायक ने ${n} मेल खाते घर भेजे — अब उसका नंबर आपको दिखेगा।`);
    else d.tellBroker(l, `🤖 ${l.name}: ${n} और घर भेजे`, 'सहायक ने चैट में नए मेल खाते घर दिखाए।');
    return n;
  }

  // ───────────────────────── v99 — the owner's listing interview ─────────────────────────
  const askChips = (id: AskId, chips: { id: string; hi: string; en: string }[], optional: boolean): Chip[] =>
    [...chips.map(c => ({ id: `ASK:${id}:${c.id}`, hi: c.hi, en: c.en })), ...(optional ? [{ id: `ASK:${id}:SKIP`, hi: SKIP_CHIP.hi, en: SKIP_CHIP.en }] : [])];
  const asking = (l: PartnerLead) => { const iv = l.chat?.bot?.interview; return !!iv && !!iv.step && !iv.doneAt; };

  function startInterview(l: PartnerLead) {
    const b = botOf(l);
    if (b.interview?.doneAt) { say(l, 'धन्यवाद! जानकारी पक्की हो गई। ब्रोकर जल्द आपसे यहीं बात करेंगे।', 'Thank you! The details are confirmed. The broker will talk to you here soon.', menu(l)); return; }
    b.interview ||= { fields: d.ownerFacts(l), skipped: [], tries: 0, startedAt: nowIso() };
    d.hist(l, 'The GENZ assistant started the listing questions for the owner');
    askNext(l, { hi: 'धन्यवाद! जानकारी पक्की हो गई ✅ — ब्रोकर को आपका नंबर दिखने लगा है।\nअब ब्रोकर आपकी लिस्टिंग जल्दी बना सकें, इसलिए कुछ छोटे सवाल (ज़्यादातर एक टैप)। जिस पर पक्का नहीं हैं, “पता नहीं” दबा दें।', en: 'Thank you! Confirmed ✅ — the broker can now see your number.\nSo he can make your listing quickly, a few short questions (mostly one tap). Tap “Not sure” where you are not sure.' });
  }
  /** ask the next relevant question — or finish when there is none */
  function askNext(l: PartnerLead, lead?: { hi: string; en: string }) {
    const b = botOf(l); const iv = b.interview; if (!iv) return;
    const a = nextAsk(iv.fields, iv.skipped);
    if (!a) { if (lead) say(l, lead.hi, lead.en); return finishInterview(l); }
    iv.step = a.id; iv.tries = 0;
    const pr = progress(iv.fields, iv.skipped); const tag = `(${Math.min(pr.done + 1, pr.total)}/${pr.total}) `;
    say(l, `${lead ? lead.hi + '\n\n' : ''}${tag}${a.hi}`, `${lead ? lead.en + '\n\n' : ''}${tag}${a.en}`, askChips(a.id, a.chips, a.optional));
  }
  /** a tapped answer or typed words for the open question. Returns false when the text was not an answer at all (so normal replies can run). */
  function answerAsk(l: PartnerLead, input: { chip?: string; text?: string }): boolean {
    const b = botOf(l); const iv = b.interview; if (!iv?.step || iv.doneAt) return false;
    const id = iv.step as AskId; const r = applyAnswer(iv.fields, id, input);
    if (!r.ok) {
      // a typed line that is clearly something else (rate, photos, "when will it be live") is served normally; the question stays open
      if (input.text && !input.chip) { const it = readIntent(input.text); if (['PRICE', 'PHOTOS', 'VISIT', 'STATUS'].includes(it) && id !== 'price') return false; }
      iv.tries += 1;
      if (iv.tries >= 3 && id !== 'price' && id !== 'ptype' && id !== 'address') { iv.skipped.push(id); iv.step = undefined; askNext(l, { hi: 'कोई बात नहीं, इसे ब्रोकर आपसे पूछ लेंगे।', en: 'No problem — the broker will ask you this later.' }); return true; }
      if (iv.tries >= 4) { iv.step = undefined; b.needsBroker = 'listing-answer'; say(l, 'मैं ये समझ नहीं पा रहा — मैंने ब्रोकर को बता दिया है, वे आपसे यहीं पूछ लेंगे। 🙏', 'I cannot read this — I have told the broker, he will ask you here. 🙏', [M.human]); d.tellBroker(l, `✍️ ${l.name}: जवाब नहीं पढ़ पाया`, 'सहायक मालिक का जवाब नहीं समझ सका — आप ड्राफ़्ट पूरा कर लें।'); return true; }
      say(l, r.hint.hi, r.hint.en, (() => { const a = nextAsk(iv.fields, iv.skipped.filter(x => x !== id)); return a && a.id === id ? askChips(a.id, a.chips, a.optional) : undefined; })());
      return true;
    }
    iv.fields = r.fields; if (r.skip) iv.skipped.push(id);
    iv.step = undefined; keepDraft(l); askNext(l, r.ack); return true;
  }
  /** save what the owner has said so far as the broker's draft (silently) — an owner who answers three questions and leaves is not lost */
  function keepDraft(l: PartnerLead) {
    const iv = botOf(l).interview; if (!iv || iv.doneAt) return;
    const c = composeListing(iv.fields); const res = d.saveDraft(l, { ...iv.fields, title: c.title, description: c.description });
    if (!('error' in res)) iv.draftId = res.id;
  }
  function finishInterview(l: PartnerLead) {
    const b = botOf(l); const iv = b.interview; if (!iv) return;
    iv.step = undefined; iv.doneAt = nowIso();
    const c = composeListing(iv.fields); iv.fields.title = c.title; iv.fields.description = c.description; iv.fields.tags = [...new Set([...(iv.fields.tags || []), ...c.tags])];
    const res = d.saveDraft(l, iv.fields);
    const sum = summaryLine(iv.fields);
    if ('error' in res) {
      b.needsBroker = 'listing-draft';
      say(l, `शुक्रिया ${first(l.name)}! 🙏 आपकी जानकारी मैंने ब्रोकर को भेज दी है: ${sum.hi}\nब्रोकर आगे का काम आपसे यहीं करेंगे।`, `Thank you ${first(l.name)}! 🙏 I have passed your details to the broker: ${sum.en}\nHe will take the next step with you here.`, menu(l));
      d.tellBroker(l, `📝 ${l.name}: जानकारी तैयार`, `${sum.hi} — ड्राफ़्ट अपने आप नहीं बन पाया, कृपया ‘Add listing’ से जोड़ें।`); return;
    }
    const fresh = res.created || iv.draftId === res.id;   // made by these very questions (even if saved bit by bit) → “ready”; the owner's earlier draft → “updated”
    iv.draftId = res.id;
    say(l, `शुक्रिया ${first(l.name)}! 🙏 आपकी प्रॉपर्टी की जानकारी ब्रोकर के पास ड्राफ़्ट के रूप में पहुँच गई:\n${sum.hi}\n\nआगे क्या होगा: ब्रोकर आपको लिस्टिंग की मंज़ूरी का लिंक भेजेंगे — आपकी “हाँ” के बिना लिस्टिंग लाइव नहीं होगी। फ़ोटो और काग़ज़ ब्रोकर आपसे अलग से मँगवाएँगे। कभी भी नीचे दबाकर स्थिति देख सकते हैं।`,
      `Thank you ${first(l.name)}! 🙏 Your property details are with the broker as a draft:\n${sum.en}\n\nWhat happens next: the broker will send you an approval link — the listing does NOT go live without your “yes”. He will ask you for photos and papers separately. Tap below any time to see where it stands.`, menu(l));
    d.audit(l, 'SHOP_LEAD_OWNER_DRAFT', `The GENZ assistant asked the owner the listing questions and made draft ${res.id}${fresh ? '' : ' (updated the owner\'s earlier draft)'}${res.locked ? ' — not changed: the owner was already asked for consent' : ''}`);
    d.hist(l, `Listing questions answered by the owner — draft ${res.id} ${fresh ? 'made' : 'updated'} (${res.missing.length} item(s) still needed)`);
    d.tellBroker(l, `📝 ${l.name}: ड्राफ़्ट ${fresh ? 'तैयार' : 'अपडेट'}`, `${sum.hi}. ${res.missing.length ? `अभी ${res.missing.length} चीज़ बाकी — ड्राफ़्ट खोलें।` : 'सब भरा है — मालिक को मंज़ूरी का लिंक भेज सकते हैं।'}`);
  }
  /** "where is my listing?" — said from the real state, never promised */
  function ownerStatus(l: PartnerLead) {
    const b = botOf(l); const iv = b.interview;
    if (iv && !iv.doneAt) { say(l, 'बस कुछ सवाल बाकी हैं — उसके बाद ब्रोकर के पास पूरा ड्राफ़्ट पहुँच जाएगा।', 'Just a few questions left — then the full draft reaches the broker.'); if (!iv.step) askNext(l); else { const a = nextAsk(iv.fields, iv.skipped); if (a) say(l, a.hi, a.en, askChips(a.id, a.chips, a.optional)); } return; }
    const st0 = d.draftState(l);
    if (!st0) return handoff(l, 'other', ['ब्रोकर ने आपकी जानकारी देख ली है — वे खुद बताएँगे कि अगला कदम क्या है। मैंने उन्हें याद दिला दिया है।', 'The broker has your details — he will tell you the next step himself. I have reminded him.']);
    const P = st0.propertyStatus;
    const [hi, en] = P && ['active', 'under_negotiation'].includes(P) ? ['✅ आपकी प्रॉपर्टी लाइव है — ग्राहकों को दिख रही है।', '✅ Your property is live — customers can see it.']
      : P === 'sold' ? ['आपकी प्रॉपर्टी “बिक गई” दर्ज है।', 'Your property is marked as sold.'] : P === 'rented' ? ['आपकी प्रॉपर्टी “किराये पर गई” दर्ज है।', 'Your property is marked as rented.']
      : P ? ['आपकी लिस्टिंग बन चुकी है; अभी लाइव होने का इंतज़ार है।', 'Your listing is made; it is waiting to go live.']
      : st0.status === 'CONSENT_PENDING' ? ['⏳ मंज़ूरी का लिंक आपके नंबर पर भेजा जा चुका है — खोलकर “हाँ” कहें, तभी लिस्टिंग आगे बढ़ेगी।', '⏳ The approval link has been sent to your number — open it and say “yes”; only then does the listing move on.']
      : st0.status === 'READY' ? ['👍 आपकी “हाँ” मिल चुकी है — ब्रोकर लिस्टिंग लाइव कर रहे हैं।', '👍 Your “yes” is in — the broker is putting the listing live.']
      : st0.missing ? [`📝 ड्राफ़्ट ब्रोकर के पास है; उसमें अभी ${st0.missing} चीज़ बाकी है — ब्रोकर आपसे पूछेंगे।`, `📝 The draft is with the broker; ${st0.missing} item(s) are still needed — he will ask you.`]
      : ['📝 ड्राफ़्ट तैयार है — ब्रोकर जल्द आपको मंज़ूरी का लिंक भेजेंगे।', '📝 The draft is ready — the broker will send you the approval link soon.'];
    say(l, hi, en, menu(l));
  }

  /** he tapped ✅ on his need */
  function onConfirmed(l: PartnerLead) {
    if (off(l) || !l.chat) return;
    if (d.ownerSide(l)) {
      d.tellBroker(l, `🤖 ${l.name}: जानकारी पक्की`, 'मालिक ने प्रॉपर्टी की जानकारी पक्की की — उसका नंबर अब दिख रहा है। सहायक अब बाकी सवाल पूछकर ड्राफ़्ट बनाएगा।');
      return startInterview(l);
    }
    networkNote(l);   // v101 — his need goes to the network search + the broker's Buyers list now, whether or not a home of the broker's own fits
    botOf(l).followedAt ||= nowIso();   // v103 — from here the chat follows the homes by itself
    openRoom(l, true);   // v119 — his client room is there from the moment he confirms (held: the broker gets it when the number opens)
    showHomes(l, 'BOT', 'first');
  }

  /** he tapped ✏️ and wrote a change: apply what can be read, ask him to confirm again */
  function onEdit(l: PartnerLead, text: string) {
    if (off(l) || !l.chat) return;
    const ch = readNeedChange(text, d.cityOf(l)); const changed = d.applyNeed(l, ch);
    if (changed.length) {
      l.chat.reqConfirmedAt = undefined; l.chat.reqAskedAt = nowIso();
      say(l, `समझ गया — मैंने आपकी ज़रूरत बदल दी (${changed.join(', ')}). नीचे देखकर ✅ दबाएँ।`, `Got it — I updated your need (${chEn(changed)}). Check below and tap ✅.`);
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
  // ───────────────────────── v104 — photos & video in the chat ─────────────────────────
  const mediaWords = (m: { photos: number; videos: number }) => ({ hi: [m.photos ? `${m.photos} फ़ोटो` : '', m.videos ? `${m.videos} वीडियो` : ''].filter(Boolean).join(' · '), en: [m.photos ? `${m.photos} photo${m.photos === 1 ? '' : 's'}` : '', m.videos ? `${m.videos} video${m.videos === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') });
  const photoHandoff = (l: PartnerLead, h?: Property) => handoff(l, 'photos', [
    `${h ? `“${h.title.slice(0, 40)}” की ` : ''}फ़ोटो / वीडियो ब्रोकर आपको यहीं भेजेंगे — मैंने उन्हें बता दिया है। 📷`,
    `The broker will send ${h ? `the photos / video of “${h.title.slice(0, 40)}”` : 'photos / videos'} here — I have told him. 📷`]);
  /** “photos / video?” — he is shown what the listing really holds (its public photos and video, the same page the 📷 button opens); only a home with nothing is left to the broker */
  function mediaReply(l: PartnerLead) {
    if (d.ownerSide(l)) return photoHandoff(l);
    if (!confirmed(l)) return remindConfirm(l);
    const hs = liveSent(l);
    if (!hs.length) { showHomes(l); return; }
    const have = hs.map(h => ({ h, m: d.media(h) })).filter(x => x.m.photos + x.m.videos > 0);
    const none = hs.filter(h => !have.some(x => x.h.id === h.id));
    if (!have.length) return photoHandoff(l, hs[0]);
    const chips: Chip[] = have.slice(0, 4).map(({ h, m }) => ({ id: `MEDIA:${h.id}`, hi: `📷 ${h.title.slice(0, 28)}`, en: mediaWords(m).en }));
    if (none.length) chips.push({ id: `MEDIAREQ:${none[0].id}`, hi: `🙋 ${none[0].title.slice(0, 22)} की फ़ोटो माँगें`, en: 'Ask the broker for its photos' });
    chips.push(M.human);
    say(l, `📷 नीचे घर चुनें — फ़ोटो और वीडियो यहीं खुलेंगे।${none.length ? `\n(${none.length} घर की फ़ोटो अभी नहीं डाली गई — ब्रोकर से माँग सकते हैं।)` : ''}`,
      `📷 Choose a home below — its photos and video open right here.${none.length ? `\n(${none.length} home${none.length === 1 ? ' has' : 's have'} no photos yet — you can ask the broker.)` : ''}`, chips);
  }
  /** he opened the photos / video of a home: the broker is told once per home (a warm moment to offer the visit) */
  function viewed(l: PartnerLead, homeId: string): void {
    if (!l.chat || !sentIds(l).includes(homeId)) return;
    const b = botOf(l); b.viewed ||= []; if (b.viewed.includes(homeId)) return;
    b.viewed.push(homeId); if (b.viewed.length > 40) b.viewed.shift();
    const h = propOf(homeId); if (!h) return;
    d.hist(l, `Opened the photos / video of “${h.title}” in the chat`);
    d.tellBroker(l, `👀 ${l.name}: फ़ोटो/वीडियो देखे`, `${h.title} — ग्राहक ने चैट में इस घर की फ़ोटो/वीडियो खोली। विज़िट पूछने का अच्छा समय है।`);
  }

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

  // ───────────────────────── v103 — the chat follows the homes by itself ─────────────────────────
  // Level-triggered: it looks at the facts (which homes he was shown, which are live, which homes fit) and only writes when something is NEW,
  // so it can be called as often as needed — when a listing changes, when he opens the chat, and by the hourly sweep.
  //   · a home he was shown is sold / rented / withdrawn / suspended / gone → one plain line, and the next best homes (or “I will tell you when one comes”)
  //   · a home that was gone is live again (an undo) → one line
  //   · a NEW home fits his confirmed need → it is shown in the chat (at most 3, at most one push per 4 h, 10 in 30 days)
  // It keeps quiet when the bot is off, the broker is writing, the chat is in a visit flow (new homes only), he stopped answering for 30 days, or the lead is won / lost.
  const botSpoke = (l: PartnerLead, ms: number) => (l.chat?.msgs || []).filter(m => m.by === 'BOT' && m.kind !== 'HOME' && Date.now() - Date.parse(m.at) < ms).length;   // the lines it wrote (a home card is not a line)
  const followed = (l: PartnerLead, now: number) => {
    const wrote = (l.chat?.msgs || []).filter(m => m.by === 'CUSTOMER').slice(-1).map(m => Date.parse(m.at) || 0)[0] || 0;
    return now - Math.max(Date.parse(l.chat?.reqConfirmedAt || '') || 0, wrote) < BOT_WATCH.days * 86400_000;
  };
  /** v105 — whenever the chat is looked after (a listing changed, he opened the chat, the hourly sweep) his room is brought level with the chat too — even when the assistant is off or quiet */
  function follow(l: PartnerLead, now = Date.now()): number {
    let n = 0;
    try { n = followChat(l, now); } finally { try { syncRoom(l); } catch (e) { console.error('[BOT] room sync failed:', (e as Error).message); } }
    return n;
  }
  function followChat(l: PartnerLead, now = Date.now()): number {
    if (!l.chat || off(l) || d.ownerSide(l) || !confirmed(l) || l.status === 'WON' || l.status === 'LOST') return 0;
    const b = botOf(l); const gone = (b.gone ||= {}); const ids = sentIds(l);
    if (!b.followedAt) {   // a chat from before v103: what is already gone would be old news — it is only noted; from here on he is followed
      b.followedAt = nowIso(); b.seen = d.matchesFor(l).map(h => h.id);
      for (const id of ids) { const k = goneKind(propOf(id), d.isLive(propOf(id))); if (k) gone[id] = k; }
      return 0;
    }
    if (!followed(l, now) || quiet(l)) return 0;
    const lost: { id: string; t: string; k: GoneKind }[] = []; const back: { id: string; t: string }[] = [];
    for (const id of ids) {
      const h = propOf(id); const k = goneKind(h, d.isLive(h)); const t = h?.title || id;
      if (k && !gone[id]) lost.push({ id, t, k }); else if (k) gone[id] = k; else if (gone[id]) back.push({ id, t });
    }
    const sent = new Set(ids);
    const showMore = (list: Property[]) => { const wasOpen = !!l.chat!.revealedAt; for (const h of list) d.shareHome(l, h, 'BOT'); autoRoom(l); return wasOpen; };
    // 1 · a home he was shown is gone
    if (lost.length) {
      for (const x of lost) gone[x.id] = x.k;
      const one = lost.length === 1; const W = GONE_WORDS;
      say(l, one ? `ℹ️ अपडेट: “${lost[0].t}” ${W[lost[0].k].hi}।` : `ℹ️ अपडेट:\n${lost.map(x => `• ${x.t} — ${W[x.k].shortHi}`).join('\n')}`,
        one ? `ℹ️ Update: “${lost[0].t}” ${W[lost[0].k].en}.` : `ℹ️ Update:\n${lost.map(x => `• ${x.t} — ${W[x.k].shortEn}`).join('\n')}`);
      for (const x of lost) d.audit(l, 'SHOP_LEAD_HOME_GONE', `The GENZ assistant told the customer that ${x.id} is no longer available (${x.k.toLowerCase()})`);
      d.hist(l, `The assistant told him: ${lost.map(x => `“${x.t}” ${W[x.k].en}`).join('; ')}`);
      const more = d.matchesFor(l).filter(h => !sent.has(h.id)).slice(0, BOT_LIMITS.autoHomes);
      if (more.length) {
        showMore(more); const n = more.length;
        say(l, `इसकी जगह ${n} मेल खाते ${n === 1 ? 'घर' : 'घर'} ऊपर भेजे हैं — ये अभी उपलब्ध हैं।`, `I have sent ${n} matching home${n === 1 ? '' : 's'} above instead — available right now.`, menu(l));
        (b.watch ||= { pushes: 0 }).lastPushAt = nowIso();
      } else say(l, 'अभी इसके जैसा कोई और मेल खाता घर नहीं है — नया घर आते ही मैं यहीं बता दूँगा। 🙏', 'There is no other matching home right now — I will tell you here as soon as a new one comes. 🙏', menu(l));
      if (b.pendingHome && lost.some(x => x.id === b.pendingHome)) { b.awaiting = undefined; b.pendingHome = undefined; }
      const openVisit = (b.visits || []).some(v => lost.some(x => x.id === v.homeId) && (v.status === 'ASKED' || v.status === 'COUNTER' || v.status === 'OK'));
      if (openVisit || !more.length) d.tellBroker(l, `⚠️ ${l.name}: ${lost.map(x => x.t).join(', ').slice(0, 60)} — ${W[lost[0].k].shortHi.replace(/^[^\s]+\s/, '')}`,
        `${openVisit ? 'इस घर की विज़िट रिक्वेस्ट खुली थी — देख लें। ' : ''}${more.length ? '' : 'इसके बदले कोई मेल खाता घर नहीं है। '}सहायक ने ग्राहक को चैट में बता दिया।`);
      d.ping(l, more.length ? 'HOME' : 'MSG'); return more.length ? 2 : 1;
    }
    // 2 · a home that was gone is live again (an undo, a restore)
    if (back.length) {
      for (const x of back) delete gone[x.id];
      const names = back.map(x => `“${x.t}”`).join(', ');
      say(l, `✅ अच्छी खबर: ${names} फिर से उपलब्ध ${back.length === 1 ? 'है' : 'हैं'}।`, `✅ Good news: ${names} ${back.length === 1 ? 'is' : 'are'} available again.`, menu(l));
      d.hist(l, `The assistant told him: ${names} available again`); d.ping(l, 'MSG'); return 1;
    }
    // 3 · a NEW home fits his need
    if (b.awaiting || d.ownerSide(l) || botSpoke(l, 3600_000) >= BOT_LIMITS.perHour) return 0;   // a plain “gone / back” line above is never held back; a PUSH of new homes is (never a wall of bot talk)
    const w = (b.watch ||= { pushes: 0 });
    if (w.pushes >= BOT_WATCH.maxPushes || (w.lastPushAt && now - Date.parse(w.lastPushAt) < BOT_WATCH.gapHours * 3600_000)) return 0;
    const known = new Set(b.seen || []);
    const pick = d.matchesFor(l).filter(h => !sent.has(h.id) && !known.has(h.id)).slice(0, BOT_LIMITS.autoHomes);
    if (!pick.length) return 0;
    const wasOpen = showMore(pick); const n = pick.length;
    w.pushes++; w.lastPushAt = nowIso(); b.seen = [...known, ...pick.map(h => h.id)];
    say(l, `🆕 आपकी ज़रूरत से मेल खाता ${n === 1 ? 'नया घर' : `${n} नए घर`} आया है — ऊपर भेजा है। पसंद आए तो 📅 विज़िट दबाएँ।`,
      `🆕 ${n === 1 ? 'A new home' : `${n} new homes`} that fit${n === 1 ? 's' : ''} your need just came — I have sent ${n === 1 ? 'it' : 'them'} above. If you like ${n === 1 ? 'it' : 'one'}, choose 📅 visit.`, menu(l));
    d.hist(l, `The assistant showed ${n} new matching home(s) that came after he confirmed: ${pick.map(h => `“${h.title}”`).join(', ').slice(0, 160)}`);
    if (b.needsBroker === 'no-match') b.needsBroker = undefined;
    if (!wasOpen) d.tellBroker(l, `🤖 ${l.name}: नया घर आया — नंबर खुल गया`, `सहायक ने ${n} नया मेल खाता घर भेजा — अब उसका नंबर आपको दिखेगा।`);
    else d.tellBroker(l, `🆕 ${l.name}: ${n} नया घर भेजा`, 'नया मेल खाता घर आया — सहायक ने चैट में दिखा दिया।');
    d.ping(l, 'HOME'); return 2;
  }

  function handoff(l: PartnerLead, why: string, line?: [string, string]) {
    const b = botOf(l); b.handoffAt = nowIso(); b.quietUntil = new Date(Date.now() + BOT_LIMITS.handoffHours * 3600_000).toISOString(); b.needsBroker = why;
    say(l, line?.[0] || 'ठीक है 🙏 मैंने ब्रोकर को बुला लिया है — वे जल्द यहीं जवाब देंगे। (नंबर इस चैट में नहीं लिखे जाते; ब्रोकर आपसे खुद संपर्क करेंगे।)', line?.[1] || 'Okay 🙏 I have called the broker — he will reply here soon. (Numbers cannot be typed in this chat; the broker will reach you himself.)');
    d.tellBroker(l, `🙋 ${l.name} आपसे बात करना चाहते हैं`, why === 'photos' ? 'फ़ोटो / वीडियो माँगे हैं।' : why === 'price' ? 'रेट / मोलभाव पर बात करना चाहते हैं।' : why === 'human' ? 'ग्राहक ने खुद आपसे बात करने को कहा।' : 'सहायक उनके सवाल का जवाब नहीं दे पाया।');
  }

  /** v101 — silently, once, right after his number opened; a failure (a room of that number already exists, a limit) is left to the broker and his tap */
  function autoRoom(l: PartnerLead) { const b = botOf(l); if (!buyerSide(l)) return; if (b.roomId || b.roomLinked) return syncRoom(l); if (!l.chat?.revealedAt) return; openRoom(l, true); }
  /** v105 — every home in his chat is in his client room: a home shown after the room opened (more homes, a new listing, one the broker sent) is added by itself.
   *  A home is offered to the room once — one the broker took out is not put back. Works for the room we opened and for the broker's own open room for his number. */
  function syncRoom(l: PartnerLead): void {
    const b = botOf(l); const rid = b.roomId || b.roomLinked; if (!rid || !buyerSide(l) || l.status === 'LOST') return;
    if (l.chat?.revealedAt && b.roomId) releaseRoom(l.brokerId, b.roomId);   // v119 — his number is open: the room he already has is the broker's now
    if (!l.chat?.revealedAt) return;   // a held room gets homes only once the number is open
    syncRoomMessagesFromLead(l.brokerId, rid, l);
    const offered = new Set(b.roomHomes || []);
    const fresh = liveSent(l).map(h => h.id).filter(id => !offered.has(id)); if (!fresh.length) return;
    const done = addRoomHomes(l.brokerId, rid, fresh); if (!done.length) return;
    b.roomHomes = [...new Set([...(b.roomHomes || []), ...done])].slice(-80);
    d.hist(l, `Put ${done.length} home(s) in his client room (shown to him in the chat)`);
  }
  function openRoom(l: PartnerLead, auto = false) {
    const b = botOf(l);
    if (!buyerSide(l)) return;
    if (!l.chat!.reqConfirmedAt) { say(l, 'क्लाइंट रूम तब बनता है जब आपकी ज़रूरत पक्की हो जाए — पहले ऊपर “हाँ, सही है” दबाएँ।', 'Your client room opens once your need is confirmed — tap “yes, correct” above first.'); return; }
    const held = !l.chat!.revealedAt;   // v119 — before his number is open the room is his alone
    if (b.roomSealed) { say(l, 'आपका क्लाइंट रूम तैयार है — नीचे के कार्ड से खोलें।', 'Your client room is ready — open it from the card below.'); return; }
    const r = openRoomAuto(l.brokerId, { name: l.name, phone: l.phone, kind: l.kind === 'RENT_IN' ? 'RENTER' : 'BUYER', note: `Shop QR lead ${l.id} · opened by the GENZ assistant on his tap`, propertyIds: held ? [] : sentIds(l), held });
    if (!r.ok) {
      if (r.code === 'EXISTS' && r.roomId) { b.roomLinked = r.roomId; syncRoom(l); }   // v105 — the broker's own room for his number gets his homes too (its link is still the broker's to send)
      if (auto) return;
      if (r.code === 'EXISTS') { say(l, 'आपका क्लाइंट रूम ब्रोकर के पास पहले से है — मैंने उन्हें कहा है कि आपको उसका लिंक भेजें।', 'The broker already has a client room for you — I have asked him to send you its link.'); d.tellBroker(l, `🏠 ${l.name} को रूम का लिंक चाहिए`, 'उसने चैट में क्लाइंट रूम माँगा — रूम खोलकर “नया लिंक” भेजें।'); }
      else { say(l, 'अभी क्लाइंट रूम नहीं बन पाया — ब्रोकर इसे देख लेंगे।', 'I could not open the client room right now — the broker will look into it.'); d.tellBroker(l, `🏠 ${l.name}: रूम नहीं बन पाया`, r.error); }
      return;
    }
    b.roomId = r.room.id; b.roomSealed = sealLink(r.token, `lr|${l.id}`); b.roomAt = nowIso(); b.roomHomes = r.room.items.map(i => i.propertyId);
    if (held) { d.audit(l, 'SHOP_LEAD_ROOM_HELD', `Client room ${r.room.id} opened for the customer when he confirmed his need — hidden from the broker until his number is open`); say(l, '🏠 आपका क्लाइंट रूम तैयार है — आपकी सारी बातचीत और घर यहीं रहेंगे। नीचे के कार्ड से खोलें (अपना मोबाइल नंबर + कोड से)।', '🏠 Your client room is ready — your chat and your homes will be here. Open it from the card below (with your mobile number + a code).', menu(l)); return; }
    d.audit(l, 'SHOP_LEAD_ROOM_OPENED', `Client room ${r.room.id} opened by the GENZ assistant after the customer tapped for it (${r.room.items.length} home(s) put in)`);
    d.hist(l, `Client room opened by the assistant on his tap (${r.room.items.length} homes)`);
    say(l, '🏠 आपका क्लाइंट रूम तैयार है — इसमें अभी तक भेजे गए सारे घर हैं, फ़ोटो-वीडियो आने पर वहीं मिलेंगे। नीचे के कार्ड से खोलें (अपना मोबाइल नंबर + कोड से)।', '🏠 Your client room is ready — all the homes sent so far are in it, and photos / videos will come there. Open it from the card below (with your mobile number + a code).', menu(l));
    d.tellBroker(l, `🏠 ${l.name} का क्लाइंट रूम खुला`, 'सहायक ने ग्राहक के कहने पर रूम बनाया। कोड ग्राहक के फ़ोन पर SMS से जाता है।');
  }

  /** the customer's own words */
  function onText(l: PartnerLead, text: string) {
    if (!l.chat) return;
    const b = botOf(l); const intent = readIntent(text);
    if (intent === 'HUMAN') { b.awaiting = undefined; if (b.interview) b.interview.step = undefined; if (!off(l)) handoff(l, 'human'); return; }
    // a question the bot asked him is answered even while it is "quiet" (he started the flow)
    if (b.awaiting === 'WHEN' && b.pendingHome) {
      const w = readWhen(text);
      if (w) return book(l, b.pendingHome, w);
      say(l, 'समय समझ नहीं आया 🙏 — जैसे “कल शाम 5 बजे” या “रविवार सुबह” लिखें, या नीचे चुनें।', 'I could not read the time 🙏 — write for example “tomorrow 5 pm” or “Sunday morning”, or pick below.', WHEN_CHIPS.map(c => ({ id: `WHEN:${c.id}`, hi: c.hi, en: c.en })));
      return;
    }
    if (b.awaiting === 'PROMISE') { say(l, 'विज़िट से पहले ऊपर के कार्ड में वचन टिक करके नाम लिखें।', 'Before the visit, tick the promise and type your name in the card above.'); return; }
    // v99 — an open listing question: what he writes is the answer (even while "quiet"); a clearly different request falls through to the normal replies
    if (!off(l) && asking(l) && answerAsk(l, { text })) return;
    if (off(l)) return;
    // v101 — a clear change of his NEED is data, not chat: it is applied even while the assistant is "quiet" (after “talk to the broker”, or while the broker is writing). He asked in plain words — the answer must not be silence.
    const brokerActive = quiet(l) && !b.needsBroker;
    if (quiet(l) && !(intent === 'NEED' && buyerSide(l)) && intent !== 'CANCEL_VISIT' && intent !== 'STOP') return;   // v109 — cancelling a visit and “stop” are always heard
    switch (intent) {
      case 'STATUS': if (d.ownerSide(l)) return ownerStatus(l); return fallback(l);
      case 'GREET': if (!confirmed(l)) return remindConfirm(l); return say(l, `नमस्ते ${first(l.name)}! 👋 बताइए, क्या मदद करूँ?`, `Hello ${first(l.name)}! 👋 How can I help?`, menu(l));
      case 'THANKS': return say(l, 'आपका स्वागत है 🙏 कोई भी सवाल हो तो यहीं लिखिए।', 'You are welcome 🙏 Write here for any question.', menu(l));
      case 'VISIT': return startVisit(l);
      case 'MORE': if (!confirmed(l)) return remindConfirm(l); if (d.ownerSide(l)) return handoff(l, 'other'); showHomes(l); return;
      case 'AVAIL': if (d.ownerSide(l)) return ownerStatus(l); return availReport(l);
      case 'PHOTOS': return mediaReply(l);
      case 'PRICE': {
        const hs = liveSent(l).slice(0, 4);
        const list = hs.length ? `\nलिस्टेड कीमत:\n${hs.map(h => `• ${h.title} — ${price(h)}`).join('\n')}` : '';
        const listEn = hs.length ? `\nListed price:\n${hs.map(h => `• ${h.title} — ${price(h)}`).join('\n')}` : '';
        return handoff(l, 'price', [`रेट और मोलभाव पर ब्रोकर आपसे खुद बात करेंगे — मैंने उन्हें बता दिया है।${list}`, `The broker will talk to you himself about the rate and any negotiation — I have told him.${listEn}`]);
      }
      case 'NEED': {
        if (d.ownerSide(l)) return fallback(l);   // v109 — an owner is not a buyer: his property is changed in the interview, not by a search
        const ch = readNeedChange(text, d.cityOf(l)); const changed = d.applyNeed(l, ch);
        if (!changed.length) return quiet(l) ? undefined : fallback(l);
        if (!l.chat.revealedAt) {
          l.chat.reqConfirmedAt = undefined; l.chat.reqAskedAt = nowIso();
          say(l, `समझ गया — आपकी ज़रूरत अब ये है (${changed.join(', ')} बदला). सही हो तो ✅ दबाएँ।`, `Understood — your need is now this (${chEn(changed)} changed). Tap ✅ if it is right.`);
          d.addMsg(l, { by: 'BOT', kind: 'ASK', text: d.needLine(l) });
        } else {
          l.chat.reqText = d.needLine(l);
          say(l, `ज़रूरत अपडेट कर दी: ${d.needLine(l)}। नए मेल खाते घर देखता हूँ…`, `Need updated: ${d.needLine(l)}. Looking for new matching homes…`);
          d.hist(l, `Changed his need in the chat (${chEn(changed)})`);
          networkNote(l);
          if (brokerActive) d.tellBroker(l, `✏️ ${l.name}: ज़रूरत बदली`, `${d.needLine(l)} — ग्राहक ने चैट में ज़रूरत बदली; आपका Buyers नीड भी अपडेट हो गया।`);
          else showHomes(l);
        }
        if (quiet(l) && !brokerActive) d.tellBroker(l, `✏️ ${l.name}: ज़रूरत बदली`, `${d.needLine(l)} — ग्राहक ने बदली हुई ज़रूरत लिखी; Buyers नीड अपडेट हो गया।`);
        return;
      }
      // ── v109 ──
      case 'CANCEL_VISIT': {
        const b2 = botOf(l); const open = (b2.visits || []).filter(v => v.status === 'ASKED' || v.status === 'COUNTER' || v.status === 'OK');
        if (!open.length) return say(l, 'अभी आपकी कोई खुली विज़िट नहीं है। नई विज़िट के लिए “विज़िट” लिखें।', 'You have no open visit right now. Write “visit” to ask for a new one.', menu(l));
        const v = open[open.length - 1]; v.status = 'NO'; v.answeredAt = nowIso(); b2.pendingHome = v.homeId; b2.awaiting = undefined;
        d.hist(l, `Cancelled the visit request for ${v.title} in the chat`);
        d.tellBroker(l, `🚫 ${l.name}: विज़िट रद्द`, `${v.title} की विज़िट ग्राहक ने रद्द की (${v.preferred}).`);
        return say(l, `ठीक है, ${v.title} की विज़िट रद्द कर दी और ब्रोकर को बता दिया। नया समय चाहिए तो “विज़िट” लिखें।`, `Done — the visit for ${v.title} is cancelled and the broker is told. Write “visit” for a new time.`);
      }
      case 'CONFIRM': return;   // “haan / ok” with nothing waiting for an answer: nothing to say
      case 'DENY': if (!!l.chat.reqAskedAt && !l.chat.reqConfirmedAt) return say(l, 'ठीक है — क्या बदलना है? बजट, इलाका या BHK लिखें, जैसे “बजट 60 लाख” या “Pandri में 3BHK”।', 'Alright — what should change? Write the budget, area or BHK, e.g. “budget 60 lakh” or “3BHK in Pandri”.'); return;
      case 'WHO': return say(l, `मैं GENZ सहायक हूँ — एक स्वचालित सहायक (इंसान नहीं)। घर दिखाना, विज़िट तय करना और आपकी ज़रूरत समझना मेरा काम है। रेट और मोलभाव ब्रोकर खुद करते हैं।`, `I am the GENZ assistant — an automatic assistant (not a person). I show homes, set up visits and note your need. Rates and bargaining are done by the broker himself.`, menu(l));
      case 'HELP': return say(l, 'मैं ये कर सकता हूँ: 🏠 घर दिखाना · 📅 विज़िट तय/रद्द करना · 📷 फ़ोटो-वीडियो भेजना · ✏️ आपकी ज़रूरत बदलना (जैसे “बजट 60 लाख”). रेट पर ब्रोकर से बात करवाता हूँ।', 'I can: 🏠 show homes · 📅 set up or cancel a visit · 📷 send photos / videos · ✏️ change your need (e.g. “budget 60 lakh”). For rates I connect you to the broker.', menu(l));
      case 'STOP': {
        const w = (botOf(l).watch ||= { pushes: 0 }); w.pushes = BOT_WATCH.maxPushes; d.hist(l, 'Asked the assistant to stop sending new homes on its own');
        d.tellBroker(l, `🔕 ${l.name}: नए घर भेजना बंद`, 'ग्राहक ने कहा कि अपने आप नए घर न भेजें। चैट में आप जवाब दे सकते हैं।');
        return say(l, 'ठीक है 🙏 अब मैं अपने आप नए घर नहीं भेजूँगा। आप लिखेंगे तभी जवाब दूँगा; ब्रोकर भी यहीं उपलब्ध हैं।', 'Okay 🙏 I will not send new homes on my own any more. I will answer only when you write; the broker is here too.');
      }
      case 'PROPERTY_Q': {
        // the assistant never invents a fact about a home: it says so, asks the broker once, and does NOT go quiet (he can keep asking)
        const b2 = botOf(l); const addr = /(address|पता|kahan|kidhar|location)/i.test(text);
        say(l, addr ? 'सही पता विज़िट तय होने पर ब्रोकर बताएँगे। बाकी जानकारी मैंने ब्रोकर से पूछ ली है — वे यहीं जवाब देंगे।' : 'ये जानकारी मेरे पास पक्की नहीं है, इसलिए मैं अंदाज़ा नहीं लगाऊँगा — ब्रोकर से पूछ लिया है, वे यहीं जवाब देंगे।', addr ? 'The exact address is shared by the broker once a visit is fixed. I have asked him the rest — he will reply here.' : 'I do not have this detail for sure, so I will not guess — I have asked the broker, he will reply here.', menu(l));
        if (!b2.lastFallbackAt || Date.now() - Date.parse(b2.lastFallbackAt) > 20 * 60_000) { b2.lastFallbackAt = nowIso(); d.tellBroker(l, `❓ ${l.name} का सवाल`, text.slice(0, 120)); }
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
      case 'MEDIA': { if (!sentIds(l).includes(arg)) return; const h = propOf(arg); echo(`📷 ${h?.title || arg}`); viewed(l, arg); return; }   // v104 — normally the page opens straight from the button; this only counts when a chip arrives without it
      case 'MEDIAREQ': { if (!sentIds(l).includes(arg)) return; const h = propOf(arg); echo(`🙋 ${h?.title || arg}`); return photoHandoff(l, h); }
      case 'HUMAN': echo(label(M.human)); if (b.interview) b.interview.step = undefined; return handoff(l, 'human');
      case 'STATUS': if (!d.ownerSide(l)) return; echo(label(M.status)); return ownerStatus(l);
      case 'ASKGO': { if (!d.ownerSide(l) || !b.interview || b.interview.doneAt) return; echo(label(M.info)); const iv = b.interview; iv.step = undefined; return askNext(l); }
      case 'ASK': {
        const iv = b.interview; if (!iv?.step || iv.doneAt) return;
        const i = arg.indexOf(':'); const qid = arg.slice(0, i); const ck = arg.slice(i + 1);
        if (qid !== iv.step) return;                                     // an old chip from an earlier question — ignore
        const a = nextAsk(iv.fields, iv.skipped.filter(x => x !== qid));
        const c = ck === 'SKIP' ? SKIP_CHIP : (a?.chips.find(x => x.id === ck));
        if (c) echo(c.hi);
        answerAsk(l, { chip: ck }); return;
      }
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
      if (containsContact(t)) return { ok: false, error: 'Do not write a phone number or any contact id' };
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
  function brokerSaid(l: PartnerLead) { const b = botOf(l); if (b.interview && !b.interview.doneAt) b.interview.step = undefined; /* the broker is asking him himself — the owner can resume with the “finish the details” button */ b.quietUntil = new Date(Date.now() + BOT_LIMITS.quietMinutes * 60_000).toISOString(); b.needsBroker = undefined; }

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
  const view = (l: PartnerLead) => { const b = l.chat?.bot || {}; const iv = b.interview; return { on: !off(l), following: !off(l) && !!b.followedAt && followed(l, Date.now()), watchPushes: b.watch?.pushes || 0, viewed: [...(b.viewed || [])], offByLead: !!b.off, offByBroker: !!d.broker(l)?.sahayakOff, quiet: quiet(l), needsBroker: b.needsBroker || null, visits: (b.visits || []).slice(-6), room: !!b.roomId,
    interview: iv ? { finished: !!iv.doneAt, asking: !!iv.step, draftId: iv.draftId || null, ...progress(iv.fields, iv.skipped) } : null,
    network: b.network ? { count: b.network.count, min: b.network.min, max: b.network.max, reqId: b.network.reqId || null, at: b.network.at } : null }; };

  return { welcome, onConfirmed, onEdit, onText, onChip, onPromise, brokerReply, brokerSaid, explore, like, roomLink, sentIds, view, off, startVisit, showHomes, follow, viewed, syncRoom };
}
export type Sahayak = ReturnType<typeof makeSahayak>;
