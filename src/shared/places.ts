/**
 * v90 — one place for "where is this?". Pure functions, no I/O, used by the server (matching) and the app (pickers).
 *
 * The problems this solves:
 *  - A client who writes only "Raipur" must still match a home in "Shankar Nagar" (city-wide wish).
 *  - "Shanker Nagar", "shankarnagar", "SHANKAR NAGAR, Raipur" must all be the same place.
 *  - Areas that sit next to each other (same zone of the city) are a near match, not a miss.
 *  - Sign-up / forms can offer the real areas of the chosen city and tidy what was typed.
 * Free text is still accepted everywhere — India has more places than any list holds.
 */
import { CITY_LOCALITIES, INDIA_STATES } from './india.js';
import { normCity } from './cities.js';

/** Zones of a city: areas in the same zone count as "near". Only places we are sure about are listed. */
export const CITY_ZONES: Record<string, Record<string, string[]>> = {
  Raipur: {
    'Central / old city': ['Civil Lines', 'Sadar Bazar', 'Fafadih', 'Shankar Nagar', 'Samta Colony', 'Rajendra Nagar', 'Moudhapara', 'Kalibadi', 'Brahmapara', 'Purani Basti', 'Byron Bazar', 'Ravi Nagar', 'Tikrapara', 'Pandri', 'Pachpedi Naka'],
    'VIP Road side': ['Telibandha', 'VIP Road', 'Devendra Nagar', 'Marine Drive'],
    'Naya Raipur': ['Naya Raipur', 'Atal Nagar', 'Rakhi', 'Kharora', 'Uparwara', 'Sector 15', 'Sector 21', 'Sector 24', 'Sector 27', 'Sector 29'],
  },
};

/** Spellings people really use → the name we keep. (Key is compared after the same normalisation as `placeKey`.) */
const ALIASES: Record<string, Record<string, string[]>> = {
  Raipur: {
    'Shankar Nagar': ['shanker nagar', 'shankarnagar', 'sankar nagar', 'शंकर नगर', 'शंकरनगर'],
    'Telibandha': ['telibanda', 'teli bandha', 'tellibandha', 'telibandh', 'तेलीबांधा', 'तेलीबान्धा'],
    'VIP Road': ['v i p road', 'v.i.p. road', 'vip rd', 'vip marg', 'वीआईपी रोड', 'वीआईपी'],
    'Devendra Nagar': ['devendranagar', 'devender nagar', 'देवेंद्र नगर'],
    'Civil Lines': ['civilines', 'civil line', 'सिविल लाइन', 'सिविल लाइंस'],
    'Pandri': ['pandari', 'पंडरी'],
    'Sadar Bazar': ['sadar bajar', 'sadarbazar', 'सदर बाजार'],
    'Samta Colony': ['samta colny', 'samta', 'समता कॉलोनी'],
    'Tatibandh': ['tatibandha', 'tatibund', 'टाटीबंध'],
    'Avanti Vihar': ['avantivihar', 'अवंती विहार'],
    'Naya Raipur': ['nava raipur', 'new raipur', 'atal nagar', 'naya raipur atal nagar', 'नया रायपुर'],
    'Khamardih': ['khamardhi', 'खमारडीह'],
    'Bhatagaon': ['bhatagoan', 'bhathagaon', 'भाटागांव'],
    'Sarona': ['sarona raipur', 'सरोना'],
    'Kota': ['kota raipur', 'कोटा'],
    'Fafadih': ['fafadi', 'phaphadih', 'फफाडीह'],
  },
};

const CITY_WORDS = new Set(['city', 'cg', 'chhattisgarh', 'chattisgarh', 'india', 'shahar', 'sheher', 'शहर']);
const WHOLE_CITY = new Set(['anywhere', 'any', 'any area', 'all', 'all areas', 'any where', 'whole city', 'entire city', 'full city', 'city wide', 'citywide', 'poora shahar', 'pura shahar', 'kahin bhi', 'koi bhi', 'koi bhi area', 'पूरा शहर', 'कहीं भी', 'कोई भी']);

/** Lower-case, no accents, only letters/digits/Devanagari, single spaces. */
function tidy(s: unknown): string {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A forgiving spelling key: "Shanker Nagar", "shankar-nagar", "Shankarnagar" → the same string.
 * Soft sounds are folded (sh→s, kh→k, th→t, dh→d, bh→b, ph→f, gh→g), doubled letters collapse, vowels e/i and o/u fold.
 */
export function placeKey(s: unknown): string {
  let t = tidy(s);
  if (!t) return '';
  t = t.replace(/\b(nager|nagr)\b/g, 'nagar').replace(/\b(colny|coloni|colonie)\b/g, 'colony');
  t = t.replace(/(sh|kh|th|dh|bh|ph|gh|ch)/g, m => ({ sh: 's', kh: 'k', th: 't', dh: 'd', bh: 'b', ph: 'f', gh: 'g', ch: 'c' } as Record<string, string>)[m]);
  t = t.replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/[ei]/g, 'i').replace(/[ou]/g, 'u').replace(/(.)\1+/g, '$1');
  return t;
}
const spaceless = (s: string) => s.replace(/\s+/g, '');

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v); if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Same place? — equal key, or one is a whole-word part of the other ("Shankar Nagar Raipur"), or a 1–2 letter slip. */
export function samePlace(a: unknown, b: unknown): boolean {
  const x = placeKey(a), y = placeKey(b);
  if (!x || !y) return false;
  const sx = spaceless(x), sy = spaceless(y);
  if (sx === sy) return true;
  const px = ` ${x} `, py = ` ${y} `;
  if ((y.length >= 4 && px.includes(py)) || (x.length >= 4 && py.includes(px))) return true;
  const longest = Math.max(sx.length, sy.length);
  if (longest < 5) return false;
  if (sx.replace(/\D/g, '') !== sy.replace(/\D/g, '')) return false; // Sector 2 is not Sector 21
  return lev(sx, sy, longest >= 9 ? 2 : 1) <= (longest >= 9 ? 2 : 1);
}

function cityKey(city: unknown): string {
  return normCity(String(city ?? '').replace(/\s*\(.*\)\s*/g, '')).toLowerCase();
}

/** Names of the places we know in a city (suggestions), without the "(Atal Nagar)" style brackets doubled up. */
export function areasOf(city: unknown): string[] {
  const ck = cityKey(city);
  if (!ck) return [];
  const out: string[] = [];
  for (const [c, list] of Object.entries(CITY_LOCALITIES)) if (cityKey(c) === ck) out.push(...list);
  for (const z of Object.values(CITY_ZONES[normCity(city as string)] || {})) out.push(...z);
  for (const k of Object.keys(ALIASES[normCity(city as string)] || {})) out.push(k);
  return [...new Set(out)];
}

/** Splits "Shankar Nagar, Pandri / VIP Road and Telibandha" into places. */
export function splitPlaces(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.map(String) : [String(input ?? '')];
  return raw.flatMap(x => x.split(/[,;/|\n]+|\s+(?:and|aur|और|या|or)\s+/i)).map(x => x.trim()).filter(Boolean);
}

/** True when the text names the whole city (or nothing at all): "Raipur", "Raipur city", "anywhere", "पूरा शहर", "". */
export function isCityLevel(city: unknown, input: unknown): boolean {
  const t = tidy(input);
  if (!t) return true;
  if (WHOLE_CITY.has(t)) return true;
  const words = t.split(' ').filter(w => !CITY_WORDS.has(w));
  const rest = words.join(' ');
  if (!rest) return true;
  const ck = cityKey(city);
  // a real area that happens to carry the city's name (Naya Raipur) is an area, not the whole city
  const canon = canonPlace(city, rest);
  if (placeKey(canon) !== placeKey(city) && areasOf(city).some(n => placeKey(n) === placeKey(canon))) return false;
  return !!ck && (cityKey(rest) === ck || placeKey(rest) === placeKey(ck));
}

/** The known name for a typed area ("shanker nagar" → "Shankar Nagar"), else a neatly capitalised version of what was typed. */
export function canonPlace(city: unknown, input: unknown): string {
  const cleaned = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const ct = normCity(city as string);
  // drop a trailing ", Raipur"
  let text = cleaned;
  const parts = text.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length > 1 && cityKey(parts[parts.length - 1]) === cityKey(city)) text = parts.slice(0, -1).join(', ');
  const aliasMap = ALIASES[ct] || {};
  const k = placeKey(text);
  for (const [name, alts] of Object.entries(aliasMap)) {
    if (placeKey(name) === k || alts.some(a => placeKey(a) === k)) return name;
  }
  const known = areasOf(city);
  const hit = known.find(n => placeKey(n) === k) || known.find(n => samePlace(n, text) && Math.abs(placeKey(n).length - k.length) <= 2);
  if (hit) return hit.replace(/\s*\(.*\)\s*/g, '').trim() || hit;
  if (/[ऀ-ॿ]/.test(text)) return text.slice(0, 80);
  return text.split(' ').map(w => (w.length > 1 && w === w.toUpperCase() && /^[A-Z0-9.]+$/.test(w)) ? w : w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(' ').slice(0, 80);
}

function zoneOf(city: unknown, place: string): string | null {
  const zones = CITY_ZONES[normCity(city as string)];
  if (!zones) return null;
  for (const [z, list] of Object.entries(zones)) {
    if (list.some(n => samePlace(n, place))) return z;
  }
  // aliases count too
  const canon = canonPlace(city, place);
  if (canon !== place) for (const [z, list] of Object.entries(zones)) if (list.some(n => samePlace(n, canon))) return z;
  return null;
}

export type FitLevel = 'exact' | 'near' | 'city' | 'none';
export interface LocalityFit { level: FitLevel; hit?: string }

/**
 * How well does a property's locality fit what the client asked for?
 *  - 'city'  : the client named the whole city (or no area) — any area of that city works
 *  - 'exact' : one of the asked areas is this area (spelling slips and "Shankar Nagar, Raipur" forms included)
 *  - 'near'  : a different area in the same zone of the city
 *  - 'none'  : somewhere else
 * The caller checks the city first.
 */
export function localityFit(city: unknown, wanted: unknown, propLocality: unknown): LocalityFit {
  const asked = splitPlaces(wanted);
  const prop = String(propLocality ?? '').trim();
  if (!asked.length) return { level: 'city' };
  const specific = asked.filter(a => !isCityLevel(city, a));
  if (!specific.length) return { level: 'city' };
  if (!prop || isCityLevel(city, prop)) return { level: 'city' };
  for (const a of specific) if (samePlace(a, prop) || samePlace(canonPlace(city, a), canonPlace(city, prop))) return { level: 'exact', hit: a };
  const pz = zoneOf(city, prop);
  if (pz) for (const a of specific) if (zoneOf(city, a) === pz) return { level: 'near', hit: a };
  return { level: 'none' };
}

/** Suggestions for a type-ahead box: known areas of the city that start with / contain / sound like what was typed. */
export function suggestAreas(city: unknown, typed: unknown, limit = 8): string[] {
  const all = areasOf(city);
  const q = placeKey(typed);
  if (!q) return all.slice(0, limit);
  const starts: string[] = [], has: string[] = [], like: string[] = [];
  for (const n of all) {
    const k = placeKey(n);
    if (k.startsWith(q)) starts.push(n); else if (k.includes(q)) has.push(n); else if (samePlace(n, typed)) like.push(n);
  }
  return [...new Set([...starts, ...has, ...like])].slice(0, limit);
}

let CITY_SET: Map<string, string> | null = null;
/** If the client wrote a city instead of (or after) the area — "Raipur", "Shankar Nagar Raipur" — which city is it? '' when none. */
export function inferCity(texts: unknown): string {
  if (!CITY_SET) {
    CITY_SET = new Map();
    for (const st of INDIA_STATES) for (const c of st.cities) { const n = normCity(c.replace(/\s*\(.*\)\s*/g, '')); if (n) CITY_SET.set(n.toLowerCase(), n); }
  }
  for (const piece of splitPlaces(texts)) {
    const t = tidy(piece).split(' ').filter(w => !CITY_WORDS.has(w));
    for (let n = Math.min(3, t.length); n >= 1; n--) {
      const tail = normCity(t.slice(-n).join(' ')).toLowerCase();
      if (CITY_SET.has(tail)) return CITY_SET.get(tail)!;
    }
  }
  return '';
}
