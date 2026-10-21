/**
 * v26 — WhatsApp forwards → draft listings (pure; browser, server and tests use the same code).
 *
 * A broker pastes the property messages lying in his WhatsApp ("*2BHK flat for sale* 📍 Shankar Nagar 1150 sqft 45 L …").
 * This turns each message into a DRAFT: type, sale / rent, city, locality, area, price, BHK, tags and the phone numbers
 * that were in it. A draft is only a suggestion — it never goes live until the broker completes it AND the property
 * owner has given consent (link or signed paper form). See server/consent.ts.
 */
import { PROPERTY_TYPES, CITY_LOCALITIES, findState, ALL_TAGS, type PropertyType } from './india.js';
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

export function findTransaction(t: string, monthly?: boolean): 'Sale' | 'Rent' | 'Lease' | undefined {
  if (/\blease\b|लीज़/i.test(t)) return 'Lease';
  if (/\b(?:rent|rental|to\s*let|kiraya|kiraye)\b|किराया|किराए|किराये/i.test(t) || monthly) return 'Rent';
  if (/\b(?:sale|sell|selling|resale|bechna|bikau|for\s*sale)\b|बिक्री|बेचना|बिकाऊ/i.test(t)) return 'Sale';
  return undefined;
}

const ALL_KNOWN: { city: string; state: string }[] = TOP_CITIES.map(c => ({ city: c.name, state: c.state }));
export function findCity(t: string): { city?: string; state?: string } {
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
