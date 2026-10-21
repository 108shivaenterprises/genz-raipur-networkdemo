/**
 * v25 — turn the text an OCR engine read from a PAN card / Aadhaar card photo into SUGGESTED field values.
 * Pure (string in, object out) so the browser, the server tests and the unit tests share it.
 *
 * Nothing here is trusted: the member sees every value in an editable box and confirms it. The checks only decide what is worth suggesting:
 *   • Aadhaar — three 4-digit groups that pass the Verhoeff check digit (a misread digit almost never passes). A 4-group run is a VID, not an Aadhaar.
 *   • PAN — 5 letters + 4 digits + 1 letter whose 4th letter is a valid holder type; look-alike characters (0/O, 1/I, 5/S, 8/B, 2/Z) are corrected by position.
 *   • PIN — 6 digits, first digit 1–9, taken from the address part.
 *   • Address — the text after “Address” (up to and including the PIN), tidied. Printed in English only (no Hindi data is loaded).
 */
import { isValidAadhaar, isValidPan, verhoeffValid } from './idRules.js';
import { PIN_RE, ADDRESS_MAX } from './kycRules.js';

export interface OcrFound {
  kind: 'PAN' | 'AADHAAR' | 'UNKNOWN';
  pan?: string;
  /** passes the Aadhaar check digit */
  aadhaar?: string;
  /** a 12-digit number that failed the check digit — shown as “please check”, never auto-accepted */
  aadhaarGuess?: string;
  /** a masked Aadhaar printed as XXXX XXXX 1234 */
  aadhaarLast4?: string;
  pincode?: string;
  address?: string;
}

const TO_DIGIT: Record<string, string> = { O: '0', o: '0', Q: '0', D: '0', I: '1', l: '1', i: '1', '|': '1', L: '1', Z: '2', z: '2', S: '5', s: '5', B: '8', b: '6', G: '6', T: '7' };
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G', '4': 'A' };

const toDigits = (tok: string): string | null => {
  let out = ''; let real = 0;
  for (const ch of tok) { if (/\d/.test(ch)) { out += ch; real++; } else if (TO_DIGIT[ch]) out += TO_DIGIT[ch]; else return null; }
  return real >= 2 ? out : null; // at least half of a 4-char group must really be digits
};

function findAadhaar(text: string): Pick<OcrFound, 'aadhaar' | 'aadhaarGuess' | 'aadhaarLast4'> {
  const lines = text.split(/\n+/);
  let guess: string | undefined; let last4: string | undefined;
  for (const line of lines) {
    const toks = line.replace(/[^0-9A-Za-z|X* ]+/g, ' ').split(/\s+/).filter(Boolean);
    // runs of 4-character groups
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].length !== 4) continue;
      let j = i; const group: string[] = [];
      while (j < toks.length && toks[j].length === 4) { group.push(toks[j]); j++; }
      // masked card: XXXX XXXX 1234
      if (group.length === 3 && /^[Xx*]{4}$/.test(group[0]) && /^[Xx*]{4}$/.test(group[1])) { const d = toDigits(group[2]); if (d && d.length === 4 && !last4) last4 = d; }
      else if (group.length === 3) {
        const ds = group.map(toDigits);
        if (ds.every(Boolean)) {
          const n = ds.join('');
          if (isValidAadhaar(n)) return { aadhaar: n, aadhaarLast4: n.slice(-4) };
          if (!guess && /^[2-9]/.test(n)) guess = n;
        }
      }
      i = j - 1; // a run of 4 groups (a 16-digit VID) is skipped on purpose
    }
    // no spaces at all: 12 digits in one token
    for (const t of toks) { if (t.length === 12) { const d = toDigits(t); if (d && d.length === 12) { if (isValidAadhaar(d)) return { aadhaar: d, aadhaarLast4: d.slice(-4) }; if (!guess && /^[2-9]/.test(d)) guess = d; } } }
  }
  return { ...(guess ? { aadhaarGuess: guess } : {}), ...(last4 ? { aadhaarLast4: last4 } : {}) };
}

function fixPanWindow(w: string): string {
  // positions 0-4 letters, 5-8 digits, 9 letter
  let o = '';
  for (let k = 0; k < 10; k++) {
    const ch = w[k];
    if (k < 5 || k === 9) o += /[A-Z]/.test(ch) ? ch : (TO_LETTER[ch] || ch);
    else o += /\d/.test(ch) ? ch : (TO_DIGIT[ch] || ch);
  }
  return o;
}
/**
 * `strict` = exact characters only (used when the photo is plainly an Aadhaar card: a PAN is not expected there, so nothing may be “fixed” into one).
 * Otherwise look-alikes are corrected by position, but only in a window that already has at least 5 of its 6 letter places as real letters and 2 of its 4 digit places as real digits —
 * so ordinary words and Aadhaar digits (e.g. “…GARH 492004” in an address) cannot be turned into a PAN.
 */
function findPan(text: string, strict: boolean): string | undefined {
  const up = text.toUpperCase();
  // every run of letters / digits, and also the text with spaces removed (a PAN is sometimes read as “ABCPD 1234 E”)
  const runs = new Set<string>(up.split(/[^A-Z0-9]+/).filter(r => r.length >= 10));
  if (!strict) for (const line of up.split(/\n+/)) { const squeezed = line.replace(/[^A-Z0-9]+/g, ''); if (squeezed.length >= 10) runs.add(squeezed); }
  for (const run of runs) {
    for (let i = 0; i + 10 <= run.length; i++) {
      const raw = run.slice(i, i + 10);
      if (strict) { if (isValidPan(raw)) return raw; continue; }
      const letters = [...raw.slice(0, 5), raw[9]].filter(c => /[A-Z]/.test(c)).length;
      const nums = [...raw.slice(5, 9)].filter(c => /\d/.test(c)).length;
      if (letters < 5 || nums < 2) continue;
      const w = fixPanWindow(raw);
      if (isValidPan(w)) return w;
    }
  }
  return undefined;
}

const JUNK = /(unique identification authority of india|government of india|www\.uidai\.gov\.in|help@uidai\.gov\.in|aadhaar is (a )?proof|aadhaar is not a proof|verify|authenticity|offline xml|qr code|1947|vid\s*:?\s*[\d ]{12,22}|download date|issue date)/gi;

function findAddress(text: string): { address?: string; pincode?: string } {
  const flat = text.replace(/\r/g, '');
  const m = /\b(?:address|addr)\b\s*[:\-]?\s*/i.exec(flat);
  if (!m) return {};
  let tail = flat.slice(m.index + m[0].length);
  tail = tail.replace(JUNK, ' ');
  // up to and including the PIN
  let piece = tail;
  let pincode: string | undefined;
  const direct = /\b([1-9]\d{5})\b/.exec(tail);
  if (direct && PIN_RE.test(direct[1])) { pincode = direct[1]; piece = tail.slice(0, direct.index + direct[0].length); }
  const cleaned = piece
    .replace(/[^\p{L}\p{N}\s,./\-:#()&']/gu, ' ')
    .split(/\n+/).map(l => l.trim()).filter(l => l.length > 1).join(', ')
    .replace(/\s{2,}/g, ' ').replace(/(,\s*){2,}/g, ', ').replace(/^[,\s:-]+|[,\s]+$/g, '');
  if (cleaned.length < 8) return pincode ? { pincode } : {};
  return { address: cleaned.slice(0, ADDRESS_MAX), ...(pincode ? { pincode } : {}) };
}

export function parseIdText(text: string): OcrFound {
  const t = String(text || '');
  const lower = t.toLowerCase();
  const looksPan = /income\s*tax|permanent\s*account|\bpan\b/.test(lower);
  const looksAadhaar = /aadhaar|aadhar|uidai|unique identification|आधार/.test(lower);
  const pan = findPan(t, looksAadhaar && !looksPan);
  const a = findAadhaar(t);
  const addr = findAddress(t);
  const out: OcrFound = { kind: pan && !a.aadhaar && !a.aadhaarGuess ? 'PAN' : (a.aadhaar || a.aadhaarGuess || a.aadhaarLast4 || looksAadhaar) && !looksPan ? 'AADHAAR' : looksPan ? 'PAN' : 'UNKNOWN' };
  if (pan) out.pan = pan;
  if (a.aadhaar) out.aadhaar = a.aadhaar;
  if (a.aadhaarGuess) out.aadhaarGuess = a.aadhaarGuess;
  if (a.aadhaarLast4) out.aadhaarLast4 = a.aadhaarLast4;
  if (addr.address) out.address = addr.address;
  if (addr.pincode) out.pincode = addr.pincode;
  return out;
}

/** Combine two readings of the same photo (e.g. two page-layout modes): the first reading wins where both found a value, the second fills the gaps. */
export function mergeFound(a: OcrFound, b: OcrFound): OcrFound {
  const out: OcrFound = { kind: a.kind !== 'UNKNOWN' ? a.kind : b.kind };
  for (const k of ['pan', 'aadhaar', 'aadhaarLast4', 'pincode', 'address'] as const) { const v = a[k] ?? b[k]; if (v) out[k] = v; }
  // a number that passes the check digit beats a guess from the other reading
  if (!out.aadhaar) { const g = a.aadhaarGuess ?? b.aadhaarGuess; if (g) out.aadhaarGuess = g; }
  return out;
}

/** true when at least one useful value was found */
export const foundAnything = (f: OcrFound) => !!(f.pan || f.aadhaar || f.aadhaarGuess || f.address || f.pincode);

// re-exported so the screen can show the same words the server would
export { verhoeffValid };
