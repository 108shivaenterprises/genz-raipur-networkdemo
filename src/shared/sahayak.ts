/**
 * v97 — GENZ सहायक (the helper that answers a customer in the QR chat by itself).
 * No AI service and no cost: plain rules for Hindi / Hinglish / English. These are the PURE parts (what did he mean, what time did he say,
 * what changed in his need) so they can be tested alone. The bot never invents a fact: prices, availability and homes come from the app's data.
 */
import { areasOf, placeKey, canonPlace, isCityLevel } from './places.js';

export type Intent = 'GREET' | 'VISIT' | 'PHOTOS' | 'PRICE' | 'AVAIL' | 'MORE' | 'HUMAN' | 'THANKS' | 'NEED' | 'OTHER';

const flat = (t: string) => String(t || '').normalize('NFKC').toLowerCase().replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

const RX = {
  human: /(broker|ब्रोकर|agent|एजेंट|insaan|इंसान|human|malik se|owner se|baat\s*(karo|karni|karna|karwa|krao)|बात\s*(करो|करनी|करना|करवा)|call\s*(me|karo|kar|back)|phone\s*karo|कॉल|फ़ोन\s*करो|फोन\s*करो|whatsapp|व्हाट्सएप|व्हाट्सऐप|mujhse\s*baat|मुझसे\s*बात|help\s*me|मदद)/,
  visit: /(visit|विज़िट|विजिट|dekh(na|ne|nay)?\s*(aa|a|hai|h|chah|ke)|dekhna|dekhne|देखना|देखने|देखनी|site\s*(par|pe|dekh)|मिलना|milna|milne|मिलने|ghar\s*dekh|aa\s*sakta|aa\s*sakti|आ\s*सकता|आ\s*सकती|aana\s*chah|आना\s*चाह|kab\s*dekh|कब\s*देख|see\s*the\s*(house|flat|property|place)|book\s*a?\s*visit|show\s*me\s*the\s*(house|flat))/,
  photos: /(photo|photos|फोटो|फ़ोटो|pic\b|pics\b|picture|tasvir|tasveer|तस्वीर|image|images|video|वीडियो|vedio|reel|walkthrough)/,
  avail: /(available|availab|avail\b|उपलब्ध|bik\s*gay|bik\s*chuk|बिक\s*गय|बिक\s*चुक|sold|rented|kiraye\s*pe\s*ja|किराये\s*पर\s*जा|khali|खाली|still\s*(there|open)|abhi\s*(bhi)?\s*(hai|h|mil)|अभी\s*(भी)?\s*(है|मिल)|mil\s*(jayega|jaega|sakta)|मिल\s*(जाएगा|सकता))/,
  price: /(price|rate\b|rates\b|kitn[aei]|कितन[ाेी]|kimat|keemat|कीमत|क़ीमत|दाम|daam|रेट|negotiat|bargain|kam\s*(kar|ho)|कम\s*(कर|हो)|discount|final\s*(rate|price)|sasta|सस्ता|costly|mehenga|महँगा|महंगा|emi\b|token|advance|deposit|डिपॉज़िट|डिपोजिट|brokerage|ब्रोकरेज)/,
  more: /(aur\s*(ghar|flat|option|dikha|koi|bhi)|और\s*(घर|फ्लैट|विकल्प|दिखा|कोई|भी)|more\s*(homes|houses|options|flats|properties)|other\s*(homes|options|properties)|dusr[ae]|doosr[ae]|दूसर[ेा]|दुसर[ेा]|options|explore|एक्सप्लोर|dikhao|दिखाओ|दिखाइए|दिखाइये|koi\s*aur|कोई\s*और|kuch\s*aur|कुछ\s*और|next\b)/,
  thanks: /(thank|thanks|thx|shukriya|shukria|शुक्रिया|dhanyavad|dhanyawad|धन्यवाद|आभार|bahut\s*achha|बहुत\s*अच्छा|great|nice\b)/,
  greet: /^(hi+|hello+|hey+|hii+|namaste|namaskar|नमस्ते|नमस्कार|हेलो|हैलो|हाय|ram\s*ram|राम\s*राम|jai\s*(shri\s*)?(ram|krishna|mata)|जय|good\s*(morning|evening|afternoon)|suprabhat|सुप्रभात)(?![a-z0-9\u0900-\u097f])/,
  need: /(bhk|बीएचके|बी\.?एच\.?के|bedroom|\d\s*(lakh|lac|lakhs|cr|crore|k\b)|\d\s*(लाख|करोड़|करोड|हज़ार|हजार)|budget|बजट|kiraya|किराया|किराये|rent\b|khareed|kharid|खरीद|buy\b|sale\b|plot\b|प्लॉट|flat\b|फ्लैट|fl[ae]t|makaan|makan|मकान|dukaan|dukan|दुकान|shop\b|office\b|ऑफिस|ऑफ़िस|villa|विला|chahiye|चाहिए|chahie|chaiye|चाहिये)/,
} as const;

/** what the customer meant, in one word. Order matters: asking for a person / a visit beats a general word. */
export function readIntent(text: string): Intent {
  const t = flat(text); if (!t) return 'OTHER';
  if (RX.human.test(t)) return 'HUMAN';
  if (RX.visit.test(t)) return 'VISIT';
  if (RX.photos.test(t)) return 'PHOTOS';
  if (RX.avail.test(t)) return 'AVAIL';
  if (RX.price.test(t)) return 'PRICE';
  if (RX.need.test(t) && (/\d/.test(t) || /(chahiye|चाहिए|चाहिये|chahie|chaiye|looking|want|need|dhund|ढूँढ|ढूंढ)/.test(t))) return 'NEED';
  if (RX.more.test(t)) return 'MORE';
  if (RX.thanks.test(t) && t.length < 60) return 'THANKS';
  if (RX.greet.test(t) && t.length < 40) return 'GREET';
  return 'OTHER';
}

// ───────────────────────── the need, read from free text ─────────────────────────
export interface NeedChange { kind?: 'BUY' | 'RENT_IN'; budget?: string; ptype?: string; bhk?: number; locality?: string }
const TYPE_RULES: [RegExp, string][] = [
  [/farm\s*house|फ़ार्म|फार्म/, 'Farm House'], [/agri|khet|खेत|कृषि/, 'Agricultural Land'], [/godown|warehouse|गोदाम/, 'Warehouse / Godown'],
  [/factory|industr|फैक्ट्री|उद्योग/, 'Industrial Plot'], [/showroom|शोरूम/, 'Showroom'], [/shop|dukaan|dukan|दुकान/, 'Commercial Shop'], [/office|ऑफ़िस|ऑफिस/, 'Commercial Office'],
  [/villa|विला/, 'Residential Villa'], [/penthouse/, 'Penthouse'], [/builder\s*floor|बिल्डर\s*फ्लोर/, 'Builder Floor'], [/plot|zameen|jamin|जमीन|ज़मीन|प्लॉट/, 'Residential Plot'],
  [/independent|house|makaan|makan|मकान|कोठी|kothi/, 'Independent House'], [/flat|apartment|अपार्टमेंट|फ्लैट|\d\s*bhk|बीएचके/, 'Residential Flat'],
];
/** `city` = the shop's / broker's city (any city of India); '' = unknown, then the area is read from the sentence itself */
export function readNeedChange(text: string, city = ''): NeedChange {
  const raw = String(text || ''); const t = flat(raw); const out: NeedChange = {};
  if (/(kiraya|किराया|किराये|kiraye|rent\b|rental|lease)/.test(t)) out.kind = 'RENT_IN';
  else if (/(khareed|kharid|खरीद|खरीदना|buy\b|purchase|sale\b|bikri|बिक्री|lena\s*hai|लेना\s*है)/.test(t)) out.kind = 'BUY';
  // 50 lakh / 1.2 cr / 15k / 15000 / ₹ 12,000
  const bhk = /(\d)\s*(?:bhk|बीएचके|bedroom)/.exec(t);
  if (bhk) out.bhk = Number(bhk[1]);
  const moneyText = raw.replace(/(\d)\s*(?:bhk|बीएचके|bedroom)\w*/gi, ' ');
  const mm = /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|cr(?:ore)?s?|k\b|thousand|लाख|करोड़|करोड|हज़ार|हजार)/i.exec(moneyText.replace(/(\d),(\d{3})/g, '$1$2'))
    || ((/(budget|बजट|kiraya|किराया|rent|price|कीमत|tak|तक|under|within)/.test(t)) ? /(?:₹|rs\.?|inr)?\s*(\d{4,9})(?!\d)/i.exec(moneyText.replace(/(\d),(\d{3})/g, '$1$2')) : null);
  if (mm) { const n = Number(mm[1]); if (n > 0) out.budget = mm[2] ? (/^(k|thousand)$/i.test(mm[2]) ? `${mm[1]}k` : `${mm[1]} ${mm[2]}`) : String(Math.round(n)); }
  for (const [re, ty] of TYPE_RULES) if (re.test(t)) { out.ptype = ty; break; }
  const loc = findArea(raw, city); if (loc) out.locality = loc;
  return out;
}
/** words that are never part of a place name — type, money, filler (Hindi / Hinglish / English) */
const NOT_PLACE = new Set(('budget rent rental kiraya kiraye sale buy purchase flat flats house houses plot plots shop shops office offices bhk bedroom villa penthouse apartment apartments godown warehouse showroom factory land farm farmhouse '
  + 'makaan makan dukaan dukan kothi zameen jamin lakh lakhs lac lacs cr crore crores thousand under within below above upto max min maximum minimum around about nearby near and aur or ya for with the a an my me mein mai main to of from want need '
  + 'chahiye chahie chaiye hai hain ho hu hoon ka ki ke ko se tak per month monthly mahina mahine price rate sasta accha achha good best safe quiet new old purana city town area location locality place ghar kharidna lena dena dekhna dekhni '
  + 'please plz pls kindly looking searching interested ready furnished unfurnished semi parking floor ground first second third lift gated society sq ft sqft i we you he she it is are was be do does can could would should will '
  + 'mujhe humein hamein mera meri mere hume koi koi bhi bahut thoda zyada kam abhi aaj kal ya wala wali wale ek do teen char paanch').split(' '));
const GENERIC_PLACE_WORD = new Set('nagar ngr colony road marg vihar sector phase ward para chowk enclave extension layout society town gram gaon naya nava purana main east west north south block mohalla basti nagara कॉलोनी नगर रोड सेक्टर'.split(' '));
/** a place named after "in / at / near" or before "mein / ke paas / में" — for cities where we hold no list, and for areas no list holds */
function areaFromPhrase(text: string): string | undefined {
  const t = String(text || '').normalize('NFKC').replace(/[​-‍﻿]/g, ' ').replace(/\s+/g, ' ').trim();
  const take = (words: string[]): string[] => { const out: string[] = []; for (const w of words) { const k = w.toLowerCase().replace(/[^a-z\u0900-\u097f]/g, ''); if (!k || NOT_PLACE.has(k) || /\d/.test(w)) break; out.push(w.replace(/[^\p{L}\p{M}\p{N}.'-]/gu, '')); if (out.length >= 3) break; } return out.filter(Boolean); };
  let words: string[] = [];
  // 1. English: "… in Whitefield under 50 lakh"
  const en = /(?:^|\s)(?:in|at|near|around|nearby|close to|towards)\s+([^,;.!?\n]{3,60})/i.exec(t);
  if (en) words = take(en[1].split(' '));
  // 2. Hinglish / Hindi: "Whitefield mein 2bhk", "वाकड़ के पास", "Aundh me"
  if (!words.length) {
    const hi = /([^,;.!?\n]{3,60}?)\s+(?:mein|me|mai|main|में|मे|ke\s*paas|ke\s*pass|ke\s*aaspas|ke\s*aas\s*paas|के\s*पास|के\s*आसपास)(?=\s|$|[,.;!?])/i.exec(t);
    if (hi) words = take(hi[1].split(' ').reverse()).reverse();
  }
  const phrase = words.join(' ').trim();
  if (phrase.length < 4 || phrase.length > 40) return undefined;
  // "nagar mein ghar", "main road", "sector" — a bare generic suffix is not a place
  if (words.every(w => GENERIC_PLACE_WORD.has(w.toLowerCase().replace(/[^a-z\u0900-\u097f]/g, '')))) return undefined;
  return phrase;
}
/** an area written in the text: first the known areas of the city (any city we hold a list for), then a place named in the sentence ("Whitefield mein", "in Baner"). Whole words only, so "nagar" alone never matches. */
export function findArea(text: string, city = ''): string | undefined {
  const key = ' ' + placeKey(text) + ' '; if (key.trim().length < 4) return undefined;
  const known = areasOf(city).map(a => a.replace(/\s*\(.*\)\s*/g, '').trim()).filter(a => a.length >= 5).sort((a, b) => b.length - a.length);
  for (const a of known) { const k = placeKey(a); if (k.length >= 5 && key.includes(' ' + k + ' ')) return a; }
  const guess = areaFromPhrase(text); if (!guess) return undefined;
  if (isCityLevel(city, guess)) return undefined;                 // "in Raipur" / "in Pune" is the city, not an area
  return canonPlace(city, guess) || undefined;
}

// ───────────────────────── when he wants to come ─────────────────────────
export interface When { hi: string; en: string; iso?: string }
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_HI = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
const DAY_RX: RegExp[] = [/(sunday|sun\b|ravivar|ravi\b|इतवार|itwar|रविवार)/, /(monday|mon\b|somvar|सोमवार)/, /(tuesday|tue\b|mangalvar|मंगलवार)/, /(wednesday|wed\b|budhvar|बुधवार)/, /(thursday|thu\b|guruvar|brihaspati|veervar|गुरुवार|बृहस्पति|वीरवार)/, /(friday|fri\b|shukravar|शुक्रवार)/, /(saturday|sat\b|shanivar|shaniwar|शनिवार|शनिवार)/];
/** "कल शाम 5 बजे", "tomorrow evening", "sunday 11am", "aaj dopahar", "weekend" → a label in both languages and (when the time is clear) an ISO instant in IST */
export function readWhen(text: string, now = new Date()): When | null {
  const t = flat(text); if (!t) return null;
  const ist = new Date(now.getTime() + 330 * 60_000);                         // read the calendar in IST with UTC getters
  const base = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  let add: number | null = null; let dayHi = ''; let dayEn = '';
  if (/(parso|parson|परसों|परसो|day after)/.test(t)) { add = 2; dayHi = 'परसों'; dayEn = 'Day after tomorrow'; }
  else if (/(\bkal\b|कल|tomorrow|tmrw|tomorow)/.test(t)) { add = 1; dayHi = 'कल'; dayEn = 'Tomorrow'; }
  else if (/(\baaj\b|\baj\b|आज|today|abhi|अभी|aaj hi|right now)/.test(t)) { add = 0; dayHi = 'आज'; dayEn = 'Today'; }
  else if (/(weekend|वीकेंड|वीक एंड|week end)/.test(t)) { const d = ist.getUTCDay(); add = d === 6 ? 0 : (6 - d + 7) % 7; dayHi = 'इस वीकेंड (शनिवार)'; dayEn = 'This weekend (Saturday)'; }
  else { for (let i = 0; i < 7; i++) if (DAY_RX[i].test(t)) { const d = ist.getUTCDay(); add = (i - d + 7) % 7; if (add === 0 && !/(aaj|आज|today)/.test(t)) add = 7; dayHi = DAYS_HI[i]; dayEn = DAYS_EN[i]; break; } }
  // part of day / clock
  let hour: number | null = null; let partHi = ''; let partEn = '';
  const clock = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|बजे|baje|bje|o'?clock)?/.exec(t.replace(/\d{4,}/g, ' '));
  const part = /(subah|subha|savere|सुबह|सवेरे|morning)/.test(t) ? 'M' : /(dopahar|dophar|दोपहर|afternoon|noon)/.test(t) ? 'A' : /(shaam|sham|शाम|evening|sandhya)/.test(t) ? 'E' : /(raat|रात|night)/.test(t) ? 'N' : '';
  if (part === 'M') { hour = 10; partHi = 'सुबह'; partEn = 'morning'; } else if (part === 'A') { hour = 14; partHi = 'दोपहर'; partEn = 'afternoon'; } else if (part === 'E') { hour = 18; partHi = 'शाम'; partEn = 'evening'; } else if (part === 'N') { hour = 20; partHi = 'रात'; partEn = 'night'; }
  let minute = 0; let clockHi = ''; let clockEn = '';
  if (clock && (clock[3] || (part && clock[1]))) {
    let h = Number(clock[1]); const mi = Number(clock[2] || 0);
    if (h >= 1 && h <= 24 && mi < 60) {
      if (clock[3] === 'pm' && h < 12) h += 12; else if (clock[3] === 'am' && h === 12) h = 0;
      else if (!clock[3] || /baje|बजे|bje|clock/.test(clock[3])) { if (part === 'E' || part === 'N' || part === 'A') { if (h < 12) h += 12; } else if (!part && h >= 1 && h <= 6) h += 12; }  // "5 baje" with no part of day → 5 in the evening
      if (h === 24) h = 0;
      hour = h; minute = mi; const h12 = h % 12 === 0 ? 12 : h % 12;
      clockHi = `${h12}${mi ? ':' + String(mi).padStart(2, '0') : ''} बजे`; clockEn = `${h12}${mi ? ':' + String(mi).padStart(2, '0') : ''} ${h >= 12 ? 'pm' : 'am'}`;
    }
  }
  if (add == null && hour == null) return null;
  if (add == null) add = 0;                                                    // only a time said: today
  const when = new Date(base + add * 86400_000);
  let iso: string | undefined;
  if (hour != null) { iso = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(), hour, minute) - 330 * 60_000).toISOString(); if (Date.parse(iso) < now.getTime() - 5 * 60_000 && add === 0 && !/(aaj|आज|today)/.test(t)) iso = undefined; }
  const hiParts = [dayHi, partHi, clockHi].filter(Boolean); const enParts = [dayEn, partEn, clockEn].filter(Boolean);
  if (!hiParts.length) return null;
  return { hi: hiParts.join(' '), en: enParts.join(' '), ...(iso ? { iso } : {}) };
}

export const WHEN_CHIPS: { id: string; hi: string; en: string; say: string }[] = [
  { id: 'aaj-shaam', hi: 'आज शाम', en: 'Today evening', say: 'आज शाम' },
  { id: 'kal-subah', hi: 'कल सुबह', en: 'Tomorrow morning', say: 'कल सुबह' },
  { id: 'kal-shaam', hi: 'कल शाम', en: 'Tomorrow evening', say: 'कल शाम' },
  { id: 'weekend', hi: 'वीकेंड', en: 'This weekend', say: 'वीकेंड' },
];

// ───────────────────────── words the bot may say (fixed, so a test can read them) ─────────────────────────
export const BOT_NAME = { hi: 'GENZ सहायक', en: 'GENZ Assistant' };
export const BOT_LIMITS = { perHour: 12, quietMinutes: 30, handoffHours: 6, autoHomes: 3, exploreHomes: 12, visitsOpen: 3 };
export const BOT_NOTE = {
  hi: 'यह जवाब GENZ सहायक (स्वचालित) ने दिया है। ज़रूरत पड़ने पर ब्रोकर खुद भी जवाब देंगे।',
  en: 'This reply came from the GENZ assistant (automatic). The broker will also reply himself when needed.',
};
