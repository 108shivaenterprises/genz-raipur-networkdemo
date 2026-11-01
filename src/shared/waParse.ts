/**
 * v26 — WhatsApp forwards → draft listings (pure; browser, server and tests use the same code).
 *
 * A broker pastes the property messages lying in his WhatsApp ("*2BHK flat for sale* 📍 Shankar Nagar 1150 sqft 45 L …").
 * This turns each message into a DRAFT: type, sale / rent, city, locality, area, price, BHK, tags and the phone numbers
 * that were in it. A draft is only a suggestion — it never goes live until the broker completes it AND the property
 * owner has given consent (link or signed paper form). See server/consent.ts.
 */
import { PROPERTY_TYPES, CITY_LOCALITIES, INDIA_STATES, findState, ALL_TAGS, type PropertyType } from './india.js';
import { TOP_CITIES, normCity } from './cities.js';

export const PASTE_MAX_CHARS = 20_000;
export const PASTE_MAX_ITEMS = 30;

export interface ParsedListing {
  idx: number;
  /** v28 — LISTING = someone has a property; NEED = a buyer / tenant requirement ("2BHK chahiye, budget 50 L") */
  kind: 'LISTING' | 'NEED';
  /** NEED only */
  budgetMin?: number;
  budgetMax?: number;
  localities?: string[];
  raw: string;
  title: string;
  transactionType?: 'Sale' | 'Rent' | 'Lease';
  propertyType?: PropertyType;
  bhk?: number;
  city?: string;
  state?: string;
  locality?: string;
  /** built-up area for buildings, plot area for land (sq ft) */
  areaSqft?: number;
  areaIsPlot?: boolean;
  dimensions?: string;
  price?: number;
  pricePerSqft?: number;
  phones: string[];
  tags: string[];
  /** fields still needed before the owner can be asked for consent */
  missing: string[];
  /** 0..1 — how much of a listing this looked like */
  confidence: number;
}

const WA_HEADER = /^\s*\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?\]?\s*(?:-\s*)?[^:\n]{1,40}:\s?/im;
const SEPARATOR = /^\s*(?:[-–—_=*~•.]{3,}|#{2,}|\d{1,2}[).]\s*$)\s*$/m;

/** WhatsApp *bold* _italic_ ~strike~ and invisible characters out; emoji kept as spaces. */
export function cleanWa(t: string): string {
  return String(t ?? '')
    .slice(0, PASTE_MAX_CHARS)
    .replace(/[​-‏‪-‮⁠﻿]/g, '')
    .replace(/(^|\s)[*_~]+(?=\S)|(?<=\S)[*_~]+(?=\s|$|[.,!?:;])/g, '$1')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, ' ')
    .replace(/\r\n?/g, '\n');
}

const MONEY_HINT = /(\d)\s*(?:cr|crore|करोड़|l\b|lac|lacs|lakh|lakhs|lk\b|लाख|k\b|हज़ार|hazar|thousand)|₹|rs\.?|inr|price|rate|demand|asking|rent|kiraya|किराया|कीमत/i;
const AREA_HINT = /sq\.?\s*(?:ft|feet|yd|yard)|sqft|sft|gaj|गज|acre|एकड़|decimal|dismil|डिसमिल|hectare|वर्ग|\d{2,3}\s*[x×*]\s*\d{2,3}|bhk|plot|flat|house|shop|land|office|godown|दुकान|मकान|प्लॉट|फ्लैट|ज़मीन|जमीन|ऑफिस/i;
/** a buyer / tenant requirement, not a property on offer */
export const NEED_RE = /\b(?:requirements?|required|reqd|req\b|requires?|need(?:ed|s)?|wanted|want(?:s)?|looking\s+for|searching|chahiye|chaiye|chahie|chahiya|chaheye|zarurat|jarurat|budget|buyers?\s+(?:hai|ready|available|for)|client\s+(?:hai|ko|ke\s+liye|needs|looking|wants)|tenant\s+(?:chahiye|for|ready))\b|चाहिए|चाहिये|ज़रूरत|जरूरत|आवश्यकता|बजट|तलाश/i;
const OFFER_RE = /\b(?:available|avl|uplabdh|for\s+sale\s+by\s+owner|owner\s+(?:direct|property)|bikau|ready\s+to\s+(?:move|sell))\b|उपलब्ध|बिकाऊ/i;
export function kindOf(t: string): 'LISTING' | 'NEED' {
  if (!NEED_RE.test(t)) return 'LISTING';
  if (OFFER_RE.test(t) && !/budget|बजट|chahiye|चाहिए|required|requirement|wanted|looking\s+for/i.test(t)) return 'LISTING';
  return 'NEED';
}
const PROPERTY_WORD = /bhk|\brk\b|plot|flat|house|duplex|villa|shop|land|office|godown|warehouse|showroom|zameen|makaan|makan|dukan|kothi|मकान|प्लॉट|दुकान|फ्लैट|ज़मीन|जमीन|घर|ऑफिस/i;
const looksNeed = (t: string) => NEED_RE.test(t) && PROPERTY_WORD.test(t) && t.length > 12;
const looksListing = (t: string) => looksNeed(t) || MONEY_HINT.test(t) && AREA_HINT.test(t) || (/bhk|plot|flat|house|duplex|shop|land|office|zameen|makaan|dukan|मकान|प्लॉट|दुकान|फ्लैट|ज़मीन|जमीन/i.test(t) && /\d/.test(t) && t.length > 25);

/** Split a paste into one chunk per property message. */
export function splitMessages(text: string): string[] {
  const t = cleanWa(text);
  let parts: string[];
  if (WA_HEADER.test(t)) {
    parts = t.split(new RegExp(WA_HEADER.source, 'gim'));
  } else if (SEPARATOR.test(t)) {
    parts = t.split(new RegExp(SEPARATOR.source, 'gm'));
  } else {
    parts = t.split(/\n\s*\n+/);
  }
  const out: string[] = [];
  for (const p of parts.map(x => x.trim()).filter(Boolean)) {
    if (!looksListing(p) && out.length) out[out.length - 1] += `\n${p}`; // a stray line ("Contact: …") belongs to the message above
    else out.push(p);
  }
  return out.filter(looksListing).slice(0, PASTE_MAX_ITEMS);
}

const num = (s: string) => Number(String(s).replace(/,/g, ''));

/** Indian mobile numbers (10 digits starting 6-9), de-duplicated */
export function findPhones(t: string): string[] {
  const out = new Set<string>();
  for (const m of t.matchAll(/(?<![\d])(?:\+?91[\s-]?|0)?([6-9]\d{2}[\s-]?\d{2}[\s-]?\d{5}|[6-9]\d{4}[\s-]?\d{5})(?![\d])/g)) {
    const d = m[1].replace(/\D/g, '');
    if (d.length === 10) out.add(d);
  }
  return [...out];
}

/** v30 — the text with every mobile number removed (a pasted forward carries the forwarding broker's number; it must never reach a public description) */
export function stripPhones(t: string): string {
  return String(t ?? '').replace(/(?:(?:call|contact|cont|ph|phone|mob|mobile|whatsapp|wa|no|number|नंबर|संपर्क)\.?\s*[:\-]?\s*)?(?<![\d])(?:\+?91[\s-]?|0)?(?:[6-9]\d{2}[\s-]?\d{2}[\s-]?\d{5}|[6-9]\d{4}[\s-]?\d{5})(?![\d])/gi, '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

/** v100 — a pasted forward also carries e-mails, links, @handles and "insta: x" lines: none of them may reach a description other people read */
export function stripContacts(t: string): string {
  return stripPhones(t)
    .replace(/[a-z0-9._%+-]{2,}\s?(?:@|\(at\)|\[at\])\s?[a-z0-9-]{2,}(?:\.[a-z0-9-]{2,})*/gi, '')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\b(?:wa\.me|t\.me|telegram\.(?:me|dog)|instagram\.com|ig\.me|facebook\.com|fb\.(?:me|com)|linkedin\.com|linktr\.ee|bit\.ly|tinyurl\.com|goo\.gl)\/?\S*/gi, '')
    .replace(/(?<![\w@.])@[a-z][a-z0-9_.]{3,}/gi, '')
    .replace(/\b(?:insta(?:gram)?|telegram|tg|snap(?:chat)?|skype|fb|facebook)\b[\s:\-–=]*(?:id|handle|username)?[\s:\-–=]*@?[a-z][a-z0-9_.]*[0-9_.][a-z0-9_.]*/gi, '')
    .replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

/** text without phone numbers, so a phone is never read as a price or an area */
const withoutPhones = (t: string) => t.replace(/(?<![\d])(?:\+?91[\s-]?|0)?(?:[6-9]\d{2}[\s-]?\d{2}[\s-]?\d{5}|[6-9]\d{4}[\s-]?\d{5})(?![\d])/g, ' ');

const AREA_UNITS: { re: RegExp; f: number }[] = [
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft|feet|fit)|sqft|sq\.?ft|sft|square\s*(?:feet|ft)|वर्ग\s*फ़?फ़ीट|वर्ग\s*फुट|वर्गफुट)/i, f: 1 },
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*(?:yd|yards?)|sqyd|gaj|गज)/i, f: 9 },
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*m(?:tr|eter|etre)?s?\b|sqm\b)/i, f: 10.7639 },
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:acres?|एकड़)/i, f: 43560 },
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:hectares?|हेक्टेयर)/i, f: 107639 },
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:decimals?|dismil|डिसमिल)/i, f: 435.6 },
];

export function findArea(t: string): { sqft?: number; dimensions?: string } {
  const s = withoutPhones(t);
  for (const u of AREA_UNITS) {
    const m = s.match(u.re);
    if (m) { const v = num(m[1]) * u.f; if (v >= 50 && v <= 100_000_000) return { sqft: Math.round(v) }; }
  }
  const d = s.match(/(?<![\d.])(\d{2,3}(?:\.\d)?)\s*(?:ft|')?\s*[x×*]\s*(\d{2,3}(?:\.\d)?)(?![\d])/i);
  if (d) { const a = num(d[1]), b = num(d[2]); if (a >= 10 && b >= 10) return { sqft: Math.round(a * b), dimensions: `${d[1]}×${d[2]}` }; }
  return {};
}

/** total price in ₹ and/or a per-sq-ft rate */
export function findPrice(t: string): { price?: number; perSqft?: number; monthly?: boolean } {
  const s = withoutPhones(t).replace(/(\d)\s*\/\s*-/g, '$1');
  const out: { price?: number; perSqft?: number; monthly?: boolean } = {};
  const per = s.match(/(?:₹|rs\.?|@|rate)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:\/|per|प्रति)\s*(?:-\s*)?(?:sq\.?\s*ft|sqft|sft|square\s*feet|वर्ग\s*फ़?ुट|fit)/i)
    || s.match(/rate\s*[:\-]?\s*(?:₹|rs\.?)?\s*(\d[\d,]*)\b(?!\s*(?:cr|crore|l\b|lac|lakh|लाख|k\b))/i);
  if (per) { const v = num(per[1]); if (v >= 50 && v <= 500_000) out.perSqft = v; }
  const cr = s.match(/(\d+(?:\.\d+)?)\s*(?:cr\b|crs?\b|crore|करोड़)/i);
  const lakh = s.match(/(\d+(?:\.\d+)?)\s*(?:l\b|lac\b|lacs\b|lakh|lakhs|lk\b|लाख)/i);
  const k = s.match(/(\d+(?:\.\d+)?)\s*(?:k\b|हज़ार|hazar|thousand)/i);
  const full = s.match(/(?:₹|rs\.?|inr|price|rent|kiraya|किराया|demand)\s*[:\-]?\s*(\d{1,3}(?:,\d{2,3})+|\d{4,9})(?![\d,])/i)
    || s.match(/(?<![\d,.])(\d{1,3}(?:,\d{2}){1,3},\d{3})(?![\d,])/);
  if (cr) out.price = Math.round(num(cr[1]) * 1e7);
  else if (lakh) out.price = Math.round(num(lakh[1]) * 1e5);
  else if (full && num(full[1]) >= 1000) out.price = num(full[1]);
  else if (k) out.price = Math.round(num(k[1]) * 1000);
  if (/per\s*month|\/\s*month|\bpm\b|monthly|महीना|mahina|\/m\b/i.test(s)) out.monthly = true;
  return out;
}

const TYPE_RULES: [RegExp, PropertyType][] = [
  [/\bpg\b|paying\s*guest|hostel|हॉस्टल|co-?living/i, 'PG / Hostel'],
  [/co-?working|को-?वर्किंग/i, 'Co-working Space'],
  [/banquet|marriage\s*(?:hall|garden|lawn)|wedding\s*(?:hall|lawn)|मैरिज\s*हॉल|बैंक्वेट/i, 'Banquet / Marriage Hall'],
  [/guest\s*house|गेस्ट\s*हाउस|\bhotel\s*(?:for|property|building|business)\b|\bresort\s*(?:for|property)\b|\blodge\s*(?:for|property|building)\b/i, 'Hotel / Guest House'],
  [/\bparking\s*(?:space|slot)s?\s*(?:for\s*)?(?:sale|rent|available)|\bgarage\s*for\s*(?:sale|rent)/i, 'Parking / Garage'],
  [/(?:factory|industrial)\s*(?:shed|building)|फैक्ट्री\s*शेड/i, 'Factory / Industrial Shed'],
  [/(?:school|hospital|college|nursing\s*home)\s*(?:building|campus|property|for\s*(?:sale|lease|rent))/i, 'School / Hospital Building'],
  [/penthouse/i, 'Penthouse'],
  [/builder\s*floor/i, 'Builder Floor'],
  [/farm\s*house|फार्म\s*हाउस/i, 'Farm House'],
  [/villa/i, 'Residential Villa'],
  [/showroom/i, 'Showroom'],
  [/godown|warehouse|गोदाम/i, 'Warehouse / Godown'],
  [/industrial|औद्योगिक/i, 'Industrial Plot'],
  [/\bshops?\b|dukan|दुकान/i, 'Commercial Shop'],
  [/office|ऑफिस/i, 'Commercial Office'],
  [/agri|khet|kheti|खेत|कृषि|farm\s*land|\bacres?\b|एकड़/i, 'Agricultural Land'],
  [/commercial\s*(?:plot|land)|(?:plot|land).{0,20}commercial/i, 'Commercial Plot'],
  [/plot|land|zameen|jameen|zamin|ज़मीन|जमीन|प्लॉट|भूखंड/i, 'Residential Plot'],
  [/duplex|bungalow|kothi|कोठी|makaan|makan|मकान|independent\s*house|row\s*house|\bhouse\b|घर/i, 'Independent House'],
  [/flat|apartment|फ्लैट|\d\s*bhk|\brk\b/i, 'Residential Flat'],
];
export function findType(t: string): PropertyType | undefined {
  for (const [re, ty] of TYPE_RULES) if (re.test(t)) return ty;
  return undefined;
}
const PLOT_TYPES = new Set<PropertyType>(['Residential Plot', 'Commercial Plot', 'Industrial Plot', 'Agricultural Land']);
export const isPlotType = (t?: string) => !!t && PLOT_TYPES.has(t as PropertyType);

/**
 * v99 — a monthly rent written as a plain number ("2bhk Kothrud for rent 18000", "kiraya 15000 per month").
 * Only a 4–5 digit number (₹2,000–₹99,999) that is NOT an area / BHK / pincode, and only when there is exactly one such number.
 * (6 digits are left alone: they are usually a pincode; a bigger rent needs "k", "lakh" or ₹.)
 */
export function bareRent(t: string): number | undefined {
  const s = withoutPhones(t).replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  const re = /(?<![\d.,])(\d{4,5})(?![\d.,])/g; const found: number[] = []; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const after = s.slice(m.index + m[1].length, m.index + m[1].length + 14); const before = s.slice(Math.max(0, m.index - 10), m.index);
    if (/^\s*(?:sq|sft|sqft|square|गज|वर्ग|acre|एकड़|dismil|bhk|rk\b|lakh|lac|cr\b|k\b|l\b|x\s*\d|\*\s*\d|मीटर|meter|sqm)/i.test(after)) continue;
    if (/(?:pin(?:code)?|पिन|floor|फ्लोर|plot\s*no\.?|house\s*no\.?|no\.?)\W*$/i.test(before)) continue;
    const v = Number(m[1]); if (v >= 2000 && v <= 99_999) found.push(v);
  }
  return found.length === 1 ? found[0] : undefined;
}

export function findTransaction(t: string, monthly?: boolean): 'Sale' | 'Rent' | 'Lease' | undefined {
  if (/\blease\b|लीज़/i.test(t)) return 'Lease';
  if (/\b(?:rent|rental|to\s*let|kiraya|kiraye)\b|किराया|किराए|किराये/i.test(t) || monthly) return 'Rent';
  if (/\b(?:sale|sell|selling|resale|bechna|bikau|for\s*sale)\b|बिक्री|बेचना|बिकाऊ/i.test(t)) return 'Sale';
  return undefined;
}

const ALL_KNOWN: { city: string; state: string }[] = TOP_CITIES.map(c => ({ city: c.name, state: c.state }));
/** v99 — city names written in Devanagari (a Hindi message). Localities in Devanagari are not read — only the city. */
const DEVANAGARI_CITY: Record<string, string> = {
  'जयपुर': 'Jaipur', 'पुणे': 'Pune', 'पूना': 'Pune', 'इंदौर': 'Indore', 'रायपुर': 'Raipur', 'भोपाल': 'Bhopal', 'नागपुर': 'Nagpur', 'लखनऊ': 'Lucknow', 'दिल्ली': 'Delhi', 'मुंबई': 'Mumbai',
  'बेंगलुरु': 'Bengaluru', 'बेंगलूरु': 'Bengaluru', 'बैंगलोर': 'Bengaluru', 'हैदराबाद': 'Hyderabad', 'अहमदाबाद': 'Ahmedabad', 'सूरत': 'Surat', 'चंडीगढ़': 'Chandigarh', 'कोलकाता': 'Kolkata',
  'चेन्नई': 'Chennai', 'नोएडा': 'Noida', 'गुरुग्राम': 'Gurugram', 'गुड़गांव': 'Gurugram', 'भिलाई': 'Bhilai', 'बिलासपुर': 'Bilaspur', 'दुर्ग': 'Durg', 'कानपुर': 'Kanpur', 'पटना': 'Patna',
  'वाराणसी': 'Varanasi', 'आगरा': 'Agra', 'जोधपुर': 'Jodhpur', 'उदयपुर': 'Udaipur', 'कोटा': 'Kota', 'नासिक': 'Nashik', 'राजकोट': 'Rajkot', 'वडोदरा': 'Vadodara', 'ग्वालियर': 'Gwalior',
  'जबलपुर': 'Jabalpur', 'रांची': 'Ranchi', 'भुवनेश्वर': 'Bhubaneswar', 'देहरादून': 'Dehradun', 'अमृतसर': 'Amritsar', 'लुधियाना': 'Ludhiana', 'गाज़ियाबाद': 'Ghaziabad', 'गाजियाबाद': 'Ghaziabad',
  'फरीदाबाद': 'Faridabad', 'मेरठ': 'Meerut', 'प्रयागराज': 'Prayagraj', 'इलाहाबाद': 'Prayagraj', 'अयोध्या': 'Ayodhya', 'उज्जैन': 'Ujjain', 'रायगढ़': 'Raigarh', 'कोरबा': 'Korba',
};
/** words that are a town AND an ordinary word / surname / colony name: never read as a city from running text ("ghar gaya", "Anand Nagar") */
const TOWN_STOP = new Set(['mandi', 'puri', 'anand', 'sagar', 'diu', 'leh', 'tura', 'mahe', 'rewa', 'gaya', 'ponda', 'jowai', 'daman']);
let TOWNS: { key: string; city: string; state: string }[] | null = null;
function townPool() {
  if (!TOWNS) {
    const seen = new Set<string>(ALL_KNOWN.map(c => c.city.toLowerCase())); TOWNS = [];
    for (const st of INDIA_STATES) for (const raw of st.cities) {
      const c = raw.replace(/\s*\(.*\)\s*/g, '').trim(); const k = c.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (k.length < 4 || seen.has(k) || TOWN_STOP.has(k)) continue; seen.add(k); TOWNS.push({ key: k, city: c, state: st.name });
    }
  }
  return TOWNS;
}
/** v100 — every city NAME written in a text (English or Devanagari, a few spellings like "bangalore"), in the order written. Unlike findCity it never guesses a city from an area name. */
export function findCityNames(t: string): { city: string; state?: string }[] {
  const text = String(t || ''); const low = ` ${text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')} `; const hits: { at: number; city: string; state?: string }[] = [];
  for (const [dv, name] of Object.entries(DEVANAGARI_CITY)) { const at = text.indexOf(dv); if (at >= 0) { const c = ALL_KNOWN.find(x => x.city === name); if (c) hits.push({ at, city: c.city, state: c.state }); } }
  for (const c of ALL_KNOWN) { const at = low.indexOf(` ${c.city.toLowerCase()} `); if (at >= 0) hits.push({ at, city: c.city, state: c.state }); }
  for (const c of townPool()) { const at = low.indexOf(` ${c.key} `); if (at >= 0) hits.push({ at, city: c.city, state: c.state }); }   // every town of every state list (a word that is also a common name is left out)
  for (const alias of ['naya raipur', 'nava raipur', 'new raipur', 'gurgaon', 'bangalore', 'bombay', 'calcutta', 'madras', 'poona', 'baroda', 'vizag']) {
    const at = low.indexOf(` ${alias} `); if (at >= 0) { const name = normCity(alias); const c = TOP_CITIES.find(x => x.name === name); if (c) hits.push({ at, city: c.name, state: c.state }); }
  }
  const seen = new Set<string>(); const out: { city: string; state?: string }[] = [];
  for (const h of hits.sort((a, b) => a.at - b.at)) if (!seen.has(h.city)) { seen.add(h.city); out.push({ city: h.city, state: h.state }); }
  return out;
}
export function findCity(t: string): { city?: string; state?: string } {
  for (const [dv, name] of Object.entries(DEVANAGARI_CITY)) if (t.includes(dv)) { const c = TOP_CITIES.find(x => x.name === name) || ALL_KNOWN.find(x => x.city === name); if (c) return { city: (c as any).name || (c as any).city, state: (c as any).state }; }
  const low = ` ${t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  for (const c of ALL_KNOWN) if (low.includes(` ${c.city.toLowerCase()} `)) return c;
  for (const alias of ['naya raipur', 'nava raipur', 'new raipur', 'gurgaon', 'bangalore', 'bombay', 'calcutta', 'madras', 'poona', 'baroda', 'vizag']) {
    if (low.includes(` ${alias} `)) { const name = normCity(alias); const c = TOP_CITIES.find(x => x.name === name); if (c) return { city: c.name, state: c.state }; }
  }
  for (const [city, locs] of Object.entries(CITY_LOCALITIES)) {
    if (locs.some(l => low.includes(` ${l.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `))) {
      const c = TOP_CITIES.find(x => x.name === city);
      return { city, state: c?.state };
    }
  }
  return {};
}

export function findLocality(t: string, city?: string): string | undefined {
  const low = ` ${t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const lists = city && CITY_LOCALITIES[city] ? [CITY_LOCALITIES[city]] : Object.values(CITY_LOCALITIES);
  for (const locs of lists) for (const l of locs) if (low.includes(` ${l.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `)) return l;
  const m = t.match(/(?:location|loc|address|area|locality|पता|स्थान|लोकेशन)\s*[:\-]\s*([^\n,|]{3,40})/i)
    || t.match(/\b(?:in|at|near|@)\s+([A-Z][\p{L}.]+(?:\s+[A-Z][\p{L}.]+){0,3})/u);
  if (m) {
    const v = m[1].replace(/\b(?:raipur|bhilai|bilaspur|road|city)\b\s*$/i, '').trim();
    if (v.length >= 3 && !/\d{3,}/.test(v)) return v.replace(/\s+/g, ' ').slice(0, 60);
  }
  return undefined;
}

const TAG_ALIASES: [RegExp, string][] = [
  [/corner/i, 'Corner Plot'], [/east\s*fac/i, 'East Facing'], [/north\s*fac/i, 'North Facing'], [/vastu/i, 'Vastu Compliant'],
  [/main\s*road|road\s*touch|highway\s*touch/i, 'Main Road'], [/park\s*fac/i, 'Park Facing'], [/gated/i, 'Gated Community'],
  [/semi[-\s]*furnished/i, 'Semi-Furnished'], [/(?<!semi[-\s]*|un)furnished/i, 'Furnished'], [/unfurnished/i, 'Unfurnished'],
  [/\blift\b/i, 'Lift'], [/parking/i, 'Covered Parking'], [/rera\s*(?:approved|registered|reg)/i, 'RERA Registered'],
  [/clear\s*title/i, 'Clear Title'], [/registry|रजिस्ट्री/i, 'Registry Ready'], [/loan/i, 'Bank Loan Available'], [/diversion|converted|\bna\b\s*land|डायवर्टेड|डायवर्सन/i, 'Converted / NA Land'],
];
export function findTags(t: string): string[] {
  const out = new Set<string>();
  for (const [re, tag] of TAG_ALIASES) if (re.test(t) && ALL_TAGS.includes(tag)) out.add(tag);
  return [...out].slice(0, 10);
}

const inrShort = (n: number) => n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;

export function parseOne(raw: string, idx = 0): ParsedListing {
  const t = cleanWa(raw).trim();
  const phones = findPhones(t);
  const area = findArea(t);
  const pr = findPrice(t);
  const propertyType = findType(t);
  const transactionType = findTransaction(t, pr.monthly) || (pr.price && pr.price >= 5e5 ? 'Sale' : undefined);
  const { city, state } = findCity(t);
  const locality = findLocality(t, city);
  const bhkM = t.match(/(\d)\s*(?:\.\s*5\s*)?bhk/i);
  const bhk = bhkM ? Number(bhkM[1]) : /\b1\s*rk\b/i.test(t) ? 0 : undefined;
  let price = pr.price;
  if (!price && transactionType === 'Rent') price = bareRent(t);
  if (!price && pr.perSqft && area.sqft && transactionType !== 'Rent') price = Math.round(pr.perSqft * area.sqft);
  const tags = findTags(t);
  const out: ParsedListing = {
    idx, kind: 'LISTING', raw: t.slice(0, 2000), title: '', phones, tags,
    transactionType, propertyType, bhk, city, state: state || (city ? undefined : undefined), locality,
    areaSqft: area.sqft, areaIsPlot: isPlotType(propertyType), dimensions: area.dimensions,
    price, pricePerSqft: pr.perSqft, missing: [], confidence: 0,
  };
  if (out.city && !out.state) out.state = TOP_CITIES.find(c => c.name === out.city)?.state;
  if (out.state && !findState(out.state)) out.state = undefined;
  const typeWord = propertyType ? (bhk !== undefined && /Flat|House|Villa|Floor|Penthouse/.test(propertyType) ? `${bhk === 0 ? '1RK' : `${bhk}BHK`} ${propertyType}` : propertyType) : 'Property';
  const txWord = transactionType === 'Rent' ? 'for Rent' : transactionType === 'Lease' ? 'on Lease' : 'for Sale';
  out.title = `${typeWord} ${txWord}${locality ? ` in ${locality}` : ''}${city ? `, ${city}` : ''}`.slice(0, 150);
  if (!propertyType) out.missing.push('propertyType');
  if (!transactionType) out.missing.push('transactionType');
  if (!city) out.missing.push('city');
  if (!locality) out.missing.push('locality');
  if (!price) out.missing.push('price');
  out.missing.push('ownerName', 'ownerPhone', 'address');
  const found = [propertyType, transactionType, city, locality, price, area.sqft].filter(Boolean).length;
  out.confidence = Math.round((found / 6) * 100) / 100;
  return out;
}

/** budget for a requirement: "40-50 L", "40 se 50 lakh", "1.2 to 1.5 cr", "50 L tak", "upto 1 cr", "budget 45 lakh", "15-20k rent" */
export function findBudget(t: string): { min?: number; max?: number } {
  const s = withoutPhones(t).replace(/(\d),(?=\d)/g, '$1');
  const unit = (u: string) => /^(?:cr|crs|crore|करोड़)/i.test(u) ? 1e7 : /^(?:l|lac|lacs|lakh|lakhs|lk|लाख)/i.test(u) ? 1e5 : /^(?:k|हज़ार|hazar|thousand)/i.test(u) ? 1e3 : 1;
  const U = '(cr\\b|crs?\\b|crore|करोड़|l\\b|lac\\b|lacs\\b|lakhs?|lk\\b|लाख|k\\b|हज़ार|hazar|thousand)';
  const range = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${U}?\\s*(?:-|–|to|se|से|tak\\s+se)\\s*(\\d+(?:\\.\\d+)?)\\s*${U}`, 'i'));
  if (range) {
    const u2 = unit(range[4]); const u1 = range[2] ? unit(range[2]) : u2;
    const a = Math.round(Number(range[1]) * u1), b = Math.round(Number(range[3]) * u2);
    if (a > 0 && b > 0) return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const p = findPrice(s);
  if (!p.price && /\b(?:rent|kiraya|kiraye|to\s*let)\b|किराय/i.test(s)) { const r = bareRent(s); if (r) p.price = r; }
  if (p.price) {
    const upto = /\b(?:upto|up\s*to|max|maximum|tak|within|under|below)\b|तक/i.test(s);
    return { min: Math.round(p.price * (upto ? 0.7 : 0.85)), max: p.price };
  }
  return {};
}

/** all known localities named in the text (a requirement often lists several) */
export function findLocalities(t: string, city?: string): string[] {
  const low = ` ${t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const lists = city && CITY_LOCALITIES[city] ? [CITY_LOCALITIES[city]] : Object.values(CITY_LOCALITIES);
  const out: string[] = [];
  for (const locs of lists) for (const l of locs) if (low.includes(` ${l.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `) && !out.includes(l)) out.push(l);
  if (!out.length) { const one = findLocality(t, city); if (one) out.push(one); }
  return out.slice(0, 10);
}

export function parseNeed(raw: string, idx = 0): ParsedListing {
  const base = parseOne(raw, idx);
  const t = base.raw;
  const b = findBudget(t);
  const localities = findLocalities(t, base.city);
  const typeWord = base.propertyType ? (base.bhk !== undefined && /Flat|House|Villa|Floor|Penthouse/.test(base.propertyType) ? `${base.bhk === 0 ? '1RK' : `${base.bhk}BHK`} ${base.propertyType}` : base.propertyType) : 'Property';
  const tx = base.transactionType || (/\b(?:rent|kiraya|kiraye|tenant|to\s*let)\b|किराय/i.test(t) || (b.max && b.max < 2e5) ? 'Rent' : 'Sale');
  const missing: string[] = [];
  if (!base.propertyType) missing.push('propertyType');
  if (!base.city) missing.push('city');
  if (!localities.length) missing.push('localities');
  if (!b.max) missing.push('budget');
  missing.push('customerName', 'customerPhone');
  const found = [base.propertyType, base.city, localities.length, b.max].filter(Boolean).length;
  return {
    ...base, kind: 'NEED', transactionType: tx, budgetMin: b.min, budgetMax: b.max, localities, locality: localities[0], price: undefined,
    title: `${typeWord} wanted${tx === 'Rent' ? ' on rent' : ''}${localities[0] ? ` in ${localities[0]}` : ''}${base.city ? `, ${base.city}` : ''}`.slice(0, 150),
    missing, confidence: Math.round((found / 4) * 100) / 100,
  };
}

export function parsePaste(text: string): ParsedListing[] {
  return splitMessages(text).map((m, i) => kindOf(m) === 'NEED' ? parseNeed(m, i) : parseOne(m, i));
}

export const priceLabel = (p?: number, rent?: boolean) => (p ? `${inrShort(p)}${rent ? ' / month' : ''}` : '');
export { PROPERTY_TYPES };
