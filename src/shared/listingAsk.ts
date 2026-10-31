/**
 * v99 — "listing sawal": the few questions that turn a half-known property into a complete DRAFT.
 * Pure rules (no I/O) shared by three users: the GENZ सहायक (asks an OWNER in the shop-QR chat), the broker's draft wizard in the app, and tests.
 * It never invents a fact: every field comes from what the person answered; "pata nahi" simply leaves it for the broker.
 * A draft is private to the broker and never goes live by itself — the owner's consent (server/consent.ts) still comes first.
 */
import { findArea, findPrice, findType, stripPhones } from './waParse.js';
import { containsPhone } from './clientRoomRules.js';

export type AskId = 'ptype' | 'bhk' | 'area' | 'floor' | 'price' | 'furn' | 'avail' | 'address' | 'papers' | 'owner';
export interface AskChip { id: string; hi: string; en: string }
export interface Ask { id: AskId; hi: string; en: string; chips: AskChip[]; /** the person may leave it ("पता नहीं") */ optional: boolean; free: boolean }

export const BHK_TYPES = new Set(['Residential Flat', 'Independent House', 'Residential Villa', 'Builder Floor', 'Penthouse']);
export const FLOOR_TYPES = new Set(['Residential Flat', 'Commercial Shop', 'Commercial Office', 'Showroom', 'Builder Floor', 'Penthouse']);
const PLOTS = new Set(['Residential Plot', 'Commercial Plot', 'Industrial Plot', 'Agricultural Land']);
export const isPlot = (t?: string) => !!t && PLOTS.has(t);
const isRent = (f: Record<string, any>) => f.transactionType === 'Rent' || f.transactionType === 'Lease';

const PTYPE_CHIPS: (AskChip & { v: string })[] = [
  { id: 'FLAT', v: 'Residential Flat', hi: '🏢 फ़्लैट', en: 'Flat' }, { id: 'HOUSE', v: 'Independent House', hi: '🏠 मकान / कोठी', en: 'House' },
  { id: 'PLOT', v: 'Residential Plot', hi: '📐 प्लॉट', en: 'Plot' }, { id: 'LAND', v: 'Agricultural Land', hi: '🌾 खेत / ज़मीन', en: 'Farm land' },
  { id: 'SHOP', v: 'Commercial Shop', hi: '🏪 दुकान', en: 'Shop' }, { id: 'OFFICE', v: 'Commercial Office', hi: '💼 ऑफ़िस', en: 'Office' },
  { id: 'GODOWN', v: 'Warehouse / Godown', hi: '🏭 गोदाम', en: 'Godown' },
];
const FLOOR_CHIPS: AskChip[] = [
  { id: 'G', hi: 'ग्राउंड', en: 'Ground' }, { id: '1-2', hi: '1–2 मंज़िल', en: '1st–2nd' }, { id: '3-5', hi: '3–5 मंज़िल', en: '3rd–5th' }, { id: '6+', hi: '6 या ऊपर', en: '6th+' },
];
const FURN_CHIPS: AskChip[] = [
  { id: 'UNF', hi: 'खाली (बिना फ़र्नीचर)', en: 'Unfurnished' }, { id: 'SEMI', hi: 'आधा सजा (अलमारी/पंखे)', en: 'Semi-furnished' }, { id: 'FULL', hi: 'पूरा फ़र्निश्ड', en: 'Fully furnished' },
];
const AVAIL_CHIPS: AskChip[] = [
  { id: 'NOW', hi: 'अभी खाली है', en: 'Empty now' }, { id: 'D15', hi: '15 दिन में', en: 'In 15 days' }, { id: 'M1', hi: '1 महीने में', en: 'In a month' }, { id: 'LATER', hi: 'बाद में', en: 'Later' },
];
const PAPER_CHIPS: AskChip[] = [
  { id: 'REG', hi: '📄 रजिस्ट्री / मालिकाना काग़ज़ हैं', en: 'Registry / ownership papers' }, { id: 'LOAN', hi: '🏦 बैंक लोन चल रहा है', en: 'Bank loan running' },
  { id: 'SOME', hi: 'कुछ काग़ज़ हैं', en: 'Some papers' }, { id: 'UNSURE', hi: 'पता नहीं', en: 'Not sure' },
];
export const SKIP_CHIP: AskChip = { id: 'SKIP', hi: 'पता नहीं / बाद में', en: 'Not sure / later' };
export const KEEP_CHIP: AskChip = { id: 'KEEP', hi: '✔ हाँ, यही', en: 'Yes, keep this' };
const FURN_LABEL: Record<string, string> = { UNF: 'unfurnished', SEMI: 'semi-furnished', FULL: 'fully furnished' };
const AVAIL_LABEL: Record<string, string> = { NOW: 'available now', D15: 'available in about 15 days', M1: 'available in about a month', LATER: 'available later' };
const PAPER_LABEL: Record<string, string> = { REG: 'registry / ownership papers available', LOAN: 'bank loan running on it', SOME: 'some papers available', UNSURE: 'papers: owner not sure' };

const ORDER: AskId[] = ['ptype', 'bhk', 'area', 'floor', 'price', 'furn', 'avail', 'address', 'papers', 'owner'];
const PHONE10 = /^[6-9]\d{9}$/;

/** is this question relevant for this property? */
export function applies(f: Record<string, any>, id: AskId): boolean {
  const t = String(f.propertyType || '');
  switch (id) {
    case 'ptype': return true;
    case 'bhk': return BHK_TYPES.has(t);
    case 'floor': return FLOOR_TYPES.has(t);
    case 'furn': return isRent(f) && !isPlot(t) && t !== 'Warehouse / Godown';
    /** only the broker's wizard ever needs this — in the owner chat the owner's name and number are already known */
    case 'owner': return !(String(f.ownerName || '').trim().length >= 2 && PHONE10.test(String(f.ownerPhone || '').replace(/\D/g, '').slice(-10)));
    default: return true;
  }
}
/** has it been answered already? */
export function answered(f: Record<string, any>, id: AskId): boolean {
  switch (id) {
    case 'ptype': return !!f.propertyType && !['Other', 'Any'].includes(String(f.propertyType));
    case 'bhk': return Number(f.bhk) > 0;
    case 'area': return Number(f.areaSqft) > 0;
    case 'floor': return !!String(f.floor || '').trim();
    case 'price': return Number(f.askingPrice) > 0 && !!f.priceConfirmed;
    case 'furn': return !!f.furnishing;
    case 'avail': return !!String(f.availableFrom || '').trim();
    case 'address': return String(f.addressHidden || '').trim().length >= 5;
    case 'papers': return !!f.papers;
    case 'owner': return !applies(f, 'owner');
  }
}
const money = (n: number) => n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} करोड़` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} लाख` : `₹${Math.round(n).toLocaleString('en-IN')}`;
const moneyEn = (n: number) => n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`;

/** the next unanswered, relevant question — or null when the draft is as complete as the person can make it */
export function nextAsk(f: Record<string, any>, skipped: string[] = []): Ask | null {
  const id = ORDER.find(i => applies(f, i) && !answered(f, i) && !skipped.includes(i));
  return id ? askOf(f, id) : null;
}
/** how many relevant questions there are in all / already done (for "3 of 7") */
export function progress(f: Record<string, any>, skipped: string[] = [], withOwner = false): { done: number; total: number } {
  const rel = ORDER.filter(i => i === 'owner' ? withOwner : applies(f, i));   // the broker's wizard counts the owner question all along, so "9/10" does not shrink when it is answered
  return { total: rel.length, done: rel.filter(i => answered(f, i) || skipped.includes(i)).length };
}

export function askOf(f: Record<string, any>, id: AskId): Ask {
  const rent = isRent(f);
  switch (id) {
    case 'ptype': return { id, hi: 'प्रॉपर्टी किस तरह की है?', en: 'What kind of property is it?', chips: PTYPE_CHIPS.map(({ id: i, hi, en }) => ({ id: i, hi, en })), optional: false, free: true };
    case 'bhk': return { id, hi: 'कितने BHK (बेडरूम) हैं?', en: 'How many BHK (bedrooms)?', chips: ['1', '2', '3', '4', '5'].map(n => ({ id: n, hi: n === '5' ? '5 या ज़्यादा' : `${n} BHK`, en: n === '5' ? '5 or more' : `${n} BHK` })), optional: true, free: true };
    case 'area': return { id, hi: isPlot(f.propertyType) ? 'प्लॉट / ज़मीन कितनी है? (जैसे 1200 sqft, 40x60, 2 एकड़)' : 'साइज़ कितना है? (जैसे 1150 sqft)', en: isPlot(f.propertyType) ? 'How big is the plot / land? (e.g. 1200 sqft, 40x60, 2 acre)' : 'How big is it? (e.g. 1150 sqft)', chips: [], optional: true, free: true };
    case 'floor': return { id, hi: 'कौन सी मंज़िल पर है?', en: 'Which floor is it on?', chips: FLOOR_CHIPS, optional: true, free: true };
    case 'price': {
      const have = Number(f.askingPrice) > 0;
      return have
        ? { id, hi: `आपने ${money(Number(f.askingPrice))}${rent ? ' महीना' : ''} लिखा था — यही रखें? बदलना हो तो नई रकम लिखें।`, en: `You wrote ${moneyEn(Number(f.askingPrice))}${rent ? ' / month' : ''} — keep it? Write a new amount to change it.`, chips: [KEEP_CHIP], optional: false, free: true }
        : { id, hi: rent ? 'महीने का किराया कितना चाहिए? (जैसे 15000 या 15k)' : 'कितनी कीमत चाहिए? (जैसे 45 लाख या 1.2 करोड़)', en: rent ? 'What monthly rent do you want? (e.g. 15000 or 15k)' : 'What price do you want? (e.g. 45 lakh or 1.2 crore)', chips: [], optional: false, free: true };
    }
    case 'furn': return { id, hi: 'घर में फ़र्नीचर कैसा है?', en: 'How furnished is it?', chips: FURN_CHIPS, optional: true, free: false };
    case 'avail': return { id, hi: 'देखने / देने के लिए कब से उपलब्ध है?', en: 'From when is it available to show / hand over?', chips: AVAIL_CHIPS, optional: true, free: true };
    case 'address': return { id, hi: 'घर का पता लिखें (गली / मकान नंबर) — सिर्फ़ ब्रोकर को दिखेगा, पब्लिक नहीं होगा। फ़ोन नंबर न लिखें।', en: 'Write the address (lane / house number) — only the broker sees it, it is never public. Do not write a phone number.', chips: [], optional: false, free: true };
    case 'owner': return { id, hi: 'मालिक का नाम और मोबाइल नंबर? (जैसे: रमेश 9876543210)', en: 'Owner’s name and mobile number? (e.g. Ramesh 9876543210)', chips: [], optional: false, free: true };
    case 'papers': return { id, hi: 'मालिकाना काग़ज़ों की क्या स्थिति है?', en: 'What is the state of the ownership papers?', chips: PAPER_CHIPS, optional: true, free: false };
  }
}

export type AnswerResult = { ok: true; fields: Record<string, any>; skip?: false; ack: { hi: string; en: string } } | { ok: true; fields: Record<string, any>; skip: true; ack: { hi: string; en: string } } | { ok: false; hint: { hi: string; en: string } };

const clean = (t: string, n: number) => stripPhones(String(t || '')).replace(/[<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

/** apply one answer (a tapped chip and/or typed text). Returns the new fields, or a hint if it could not be read. */
export function applyAnswer(f0: Record<string, any>, id: AskId, input: { chip?: string; text?: string }): AnswerResult {
  const f = { ...f0 }; const chip = String(input.chip || ''); const text = String(input.text || '').trim();
  const ok = (hi: string, en: string): AnswerResult => ({ ok: true, fields: f, ack: { hi, en } });
  if (chip === 'SKIP') {
    const a = askOf(f, id); if (!a.optional) return { ok: false, hint: { hi: 'ये जानकारी ज़रूरी है — कृपया लिखें।', en: 'This one is needed — please write it.' } };
    return { ok: true, fields: f, skip: true, ack: { hi: 'ठीक है, ब्रोकर इसे आपसे पूछ लेंगे।', en: 'Fine — the broker will ask you this later.' } };
  }
  switch (id) {
    case 'ptype': {
      const c = PTYPE_CHIPS.find(x => x.id === chip); const v = c?.v || findType(text);
      if (!v) return { ok: false, hint: { hi: 'समझ नहीं आया — नीचे से चुनें या जैसे “फ़्लैट”, “प्लॉट”, “दुकान” लिखें।', en: 'I could not tell — pick below or write “flat”, “plot”, “shop”.' } };
      f.propertyType = v; return ok(`ठीक है — ${c?.hi.replace(/^\S+\s/, '') || v}।`, `Noted — ${c?.en || v}.`);
    }
    case 'bhk': {
      const m = /(\d{1,2})\s*(?:bhk|बीएचके|bedroom|bed\b|rk\b)/i.exec(text) || /^\s*(\d{1,2})\s*$/.exec(text) || (chip && /^\d$/.test(chip) ? [chip, chip] : null);
      const n = m ? Number(m[1]) : 0; if (!(n >= 1 && n <= 12)) return { ok: false, hint: { hi: 'BHK की संख्या लिखें, जैसे “2” या “3 BHK”।', en: 'Write the number of BHK, e.g. “2” or “3 BHK”.' } };
      f.bhk = n; return ok(`${n} BHK नोट किया।`, `${n} BHK noted.`);
    }
    case 'area': {
      const a = findArea(text);
      if (a.sqft) { f.areaSqft = a.sqft; if (a.dimensions) f.dimensions = a.dimensions; return ok(`साइज़ ${a.sqft.toLocaleString('en-IN')} sqft नोट किया।`, `Size ${a.sqft.toLocaleString('en-IN')} sq ft noted.`); }
      const bare = /^\s*(\d{3,6})\s*$/.exec(text);
      if (bare) { const n = Number(bare[1]); if (n >= 200 && n <= 50000) { f.areaSqft = n; return ok(`${n.toLocaleString('en-IN')} sqft माना — गलत हो तो बता दें।`, `Taken as ${n.toLocaleString('en-IN')} sq ft — tell me if wrong.`); } }
      return { ok: false, hint: { hi: 'इकाई भी लिखें — जैसे “1150 sqft”, “40x60”, “2 एकड़”, “200 गज”।', en: 'Please add the unit — e.g. “1150 sqft”, “40x60”, “2 acre”, “200 gaj”.' } };
    }
    case 'floor': {
      const lbl = FLOOR_CHIPS.find(x => x.id === chip);
      if (lbl) { f.floor = lbl.en; return ok(`${lbl.hi} नोट किया।`, `${lbl.en} floor noted.`); }
      const t = clean(text, 30); if (!t || /^\d{6,}$/.test(t)) return { ok: false, hint: { hi: 'मंज़िल बताएँ — जैसे “ग्राउंड”, “2nd”, “टॉप फ़्लोर”।', en: 'Tell the floor — e.g. “ground”, “2nd”, “top floor”.' } };
      f.floor = t; return ok(`मंज़िल: ${t}।`, `Floor: ${t}.`);
    }
    case 'price': {
      const rent = isRent(f);
      if (chip === 'KEEP' && Number(f.askingPrice) > 0) { f.priceConfirmed = true; f.ownerApprovedNetPrice = f.ownerApprovedNetPrice || f.askingPrice; return ok('कीमत पक्की की।', 'Price confirmed.'); }
      const clean0 = stripPhones(text).replace(/(\d)\s*\/\s*-/g, '$1');
      let n = findPrice(clean0).price || 0;
      const bare = /^\s*(?:₹|rs\.?)?\s*(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*$/i.exec(clean0);
      if (!n && bare) n = Number(bare[1].replace(/,/g, '')) || 0;
      if (!(n > 0)) return { ok: false, hint: rent ? { hi: 'किराया रकम में लिखें — जैसे “15000” या “15k”।', en: 'Write the rent as an amount — e.g. “15000” or “15k”.' } : { hi: 'कीमत लिखें — जैसे “45 लाख” या “1.2 करोड़”।', en: 'Write the price — e.g. “45 lakh” or “1.2 crore”.' } };
      if (!rent && n < 100_000) return { ok: false, hint: { hi: `${money(n)} बहुत कम लग रहा है — बिक्री की कीमत लाख या करोड़ में लिखें, जैसे “45 लाख”।`, en: `${moneyEn(n)} looks too low for a sale — write the price in lakh or crore, e.g. “45 lakh”.` } };
      if (rent && (n < 500 || n > 5_000_000)) return { ok: false, hint: { hi: 'महीने का किराया सही नहीं लगा — जैसे “15000” लिखें।', en: 'That monthly rent does not look right — write e.g. “15000”.' } };
      f.askingPrice = Math.round(n); f.ownerApprovedNetPrice = Math.round(n); f.priceConfirmed = true;
      return ok(`${money(n)}${rent ? ' महीना' : ''} नोट किया।`, `${moneyEn(n)}${rent ? ' / month' : ''} noted.`);
    }
    case 'furn': {
      const k = FURN_CHIPS.find(x => x.id === chip)?.id || (/(fully|full|poora|पूरा)/i.test(text) ? 'FULL' : /(semi|aadha|आधा)/i.test(text) ? 'SEMI' : /(unfurn|khali|खाली|bina)/i.test(text) ? 'UNF' : '');
      if (!k) return { ok: false, hint: { hi: 'नीचे से चुनें।', en: 'Please pick one below.' } };
      f.furnishing = k; return ok('फ़र्नीचर नोट किया।', 'Furnishing noted.');
    }
    case 'avail': {
      const k = AVAIL_CHIPS.find(x => x.id === chip);
      if (k) { f.availableFrom = AVAIL_LABEL[k.id]; return ok(`${k.hi} नोट किया।`, `${k.en} noted.`); }
      const t = clean(text, 40); if (t.length < 2) return { ok: false, hint: { hi: 'कब से उपलब्ध है — नीचे चुनें या लिखें।', en: 'From when — pick below or write it.' } };
      f.availableFrom = `available ${t}`; return ok(`ठीक है — ${t}।`, `Noted — ${t}.`);
    }
    case 'address': {
      if (containsPhone(text)) return { ok: false, hint: { hi: 'पते में फ़ोन नंबर न लिखें — सिर्फ़ गली / मकान नंबर।', en: 'No phone number in the address — only the lane / house number.' } };
      const t = clean(text, 200); if (t.length < 5) return { ok: false, hint: { hi: 'थोड़ा और लिखें — गली / मकान नंबर / पास की पहचान।', en: 'A little more please — lane / house number / a landmark.' } };
      f.addressHidden = t; return ok('पता नोट किया (सिर्फ़ ब्रोकर को दिखेगा)।', 'Address noted (only the broker sees it).');
    }
    case 'owner': {
      const digits = text.replace(/[\s\-.()]/g, '').replace(/(?<!\d)\+?91(?=[6-9]\d{9}(?!\d))/g, '');
      const ph = /(?<!\d)([6-9]\d{9})(?!\d)/.exec(digits)?.[1] || '';
      const name = text.replace(/[+\d\-().,:;]/g, ' ').replace(/\b(mob(?:ile)?|ph(?:one)?|no|number|contact|mr|mrs|ji)\b\.?/gi, ' ').replace(/[<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const haveName = String(f.ownerName || '').trim().length >= 2; const havePh = PHONE10.test(String(f.ownerPhone || '').replace(/\D/g, '').slice(-10));
      if (!ph && !havePh) return { ok: false, hint: { hi: '10 अंकों का मोबाइल नंबर भी लिखें — जैसे “रमेश 9876543210”।', en: 'Please add the 10-digit mobile number — e.g. “Ramesh 9876543210”.' } };
      if (name.length < 2 && !haveName) return { ok: false, hint: { hi: 'मालिक का नाम भी लिखें — जैसे “रमेश 9876543210”।', en: 'Please add the owner’s name — e.g. “Ramesh 9876543210”.' } };
      if (name.length >= 2) f.ownerName = name; if (ph) f.ownerPhone = ph;
      return ok('मालिक की जानकारी नोट की।', 'Owner details noted.');
    }
    case 'papers': {
      const k = PAPER_CHIPS.find(x => x.id === chip)?.id || (/(registry|रजिस्ट्री|mutation|खसरा|khasra|owner.?ship|मालिकाना)/i.test(text) ? 'REG' : /(loan|लोन)/i.test(text) ? 'LOAN' : '');
      if (!k) return { ok: false, hint: { hi: 'नीचे से चुनें।', en: 'Please pick one below.' } };
      f.papers = k; f.papersNote = PAPER_LABEL[k]; return ok('काग़ज़ों की स्थिति नोट की।', 'Papers noted.');
    }
  }
}

const TYPE_SHORT: Record<string, string> = { 'Residential Flat': 'Flat', 'Independent House': 'House', 'Residential Villa': 'Villa', 'Builder Floor': 'Builder Floor', 'Penthouse': 'Penthouse', 'Residential Plot': 'Plot', 'Commercial Plot': 'Commercial Plot', 'Industrial Plot': 'Industrial Plot', 'Agricultural Land': 'Agricultural Land', 'Commercial Shop': 'Shop', 'Commercial Office': 'Office', 'Showroom': 'Showroom', 'Warehouse / Godown': 'Godown' };
const inrShort = (n: number) => n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`;

/** title + a PUBLIC-SAFE description from the facts (never the address, the owner's name or any number) */
export function composeListing(f: Record<string, any>): { title: string; description: string; tags: string[] } {
  const rent = isRent(f); const t = String(f.propertyType || 'Property');
  const bits = [f.bhk ? `${f.bhk} BHK` : '', TYPE_SHORT[t] || t].filter(Boolean).join(' ');
  const where = [f.locality, f.city].filter(Boolean).join(', ');
  const title = `${bits} for ${rent ? 'Rent' : 'Sale'}${f.locality ? ` in ${f.locality}` : ''}`.slice(0, 160);
  const facts = [
    f.areaSqft ? `${Number(f.areaSqft).toLocaleString('en-IN')} sq ft${f.dimensions ? ` (${f.dimensions})` : ''}` : '',
    f.floor ? (/floor/i.test(String(f.floor)) ? String(f.floor) : `${f.floor} floor`) : '',
    f.furnishing ? FURN_LABEL[f.furnishing] || '' : '',
    f.availableFrom ? String(f.availableFrom) : '',
    f.papersNote ? String(f.papersNote) : '',
    Number(f.askingPrice) > 0 ? `${rent ? 'Rent' : 'Price'} ${inrShort(Number(f.askingPrice))}${rent ? ' / month' : ''}` : '',
  ].filter(Boolean);
  const description = `${bits} for ${rent ? 'rent' : 'sale'}${where ? ` in ${where}` : ''}.${facts.length ? ' ' + facts.join(' · ') + '.' : ''}`.slice(0, 1500);
  const tags = [f.furnishing ? { UNF: 'Unfurnished', SEMI: 'Semi-furnished', FULL: 'Furnished' }[f.furnishing as string] || '' : ''].filter(Boolean) as string[];
  return { title, description, tags };
}

/** a one-line summary the owner (or broker) can read back — Hindi + English */
export function summaryLine(f: Record<string, any>): { hi: string; en: string } {
  const rent = isRent(f); const t = TYPE_SHORT[String(f.propertyType)] || String(f.propertyType || '');
  const parts = [f.bhk ? `${f.bhk} BHK` : '', t, f.areaSqft ? `${Number(f.areaSqft).toLocaleString('en-IN')} sqft` : '', f.floor ? String(f.floor) : '', f.locality || '', Number(f.askingPrice) > 0 ? `${inrShort(Number(f.askingPrice))}${rent ? '/मह' : ''}` : ''].filter(Boolean);
  return { hi: parts.join(' · '), en: parts.join(' · ').replace('/मह', '/month') };
}
