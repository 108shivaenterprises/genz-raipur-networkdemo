/**
 * v109 — Hindi / Hinglish numbers. Devanagari digits (२ बीएचके), number words (pachas lakh, ek crore, dedh crore, do bhk), "80L" / "2cr".
 * Pure text → text: the existing readers keep working on the result, so every reader understands the same things.
 */
const DIGITS = '०१२३४५६७८९';
export const asciiDigits = (s: string) => s.replace(/[०-९]/g, c => String(DIGITS.indexOf(c))).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660));

const WORDS: Record<string, string> = {
  ek: '1', एक: '1', do: '2', दो: '2', teen: '3', tin: '3', तीन: '3', char: '4', chaar: '4', चार: '4', paanch: '5', panch: '5', paach: '5', पाँच: '5', पांच: '5',
  chhe: '6', cheh: '6', छह: '6', छः: '6', saat: '7', सात: '7', aath: '8', आठ: '8', nau: '9', नौ: '9', das: '10', दस: '10',
  barah: '12', pandrah: '15', पंद्रह: '15', bees: '20', बीस: '20', pachees: '25', पच्चीस: '25', tees: '30', तीस: '30', chalis: '40', चालीस: '40',
  pachas: '50', pachaas: '50', पचास: '50', saath: '60', साठ: '60', sattar: '70', सत्तर: '70', assi: '80', अस्सी: '80', nabbe: '90', नब्बे: '90',
  dedh: '1.5', डेढ़: '1.5', dhai: '2.5', dhaai: '2.5', adhai: '2.5', ढाई: '2.5',
};
const UNIT = /(lakh|lac|lakhs|लाख|crore|cr|करोड़|करोड|karod|hazar|hazaar|हज़ार|हजार|bhk|बीएचके|बी\s*एच\s*के|bedroom)/i;

/** words → digits only where a number word sits next to a money / BHK unit ("pachas lakh" → "50 lakh"; "do bhk" → "2 bhk"; a lone "do" stays a word) */
export function normNum(raw: string): string {
  let t = asciiDigits(String(raw ?? '')).normalize('NFKC');
  t = t.replace(/(\d)\s*(l|L)\b(?!\w)/g, '$1 lakh').replace(/(\d)\s*(cr|Cr|CR)\b(?!\w)/g, '$1 cr');
  const words = Object.keys(WORDS).sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const rx = new RegExp(`(^|[^\\p{L}\\p{N}])(${words.join('|')})(\\s+)(?=${UNIT.source})`, 'giu');
  return t.replace(rx, (_m, pre, w, sp) => `${pre}${WORDS[w.toLowerCase()] ?? WORDS[w]}${sp}`);
}
/** a bare number word with nothing next to it ("teen", "do" as the answer to "how many bedrooms?") — for steps that expect a count */
export function bareCount(raw: string): number | null {
  const t = asciiDigits(String(raw ?? '')).trim().toLowerCase().replace(/[.!?]+$/, '');
  if (/^\d{1,2}$/.test(t)) return Number(t);
  const w = WORDS[t] ?? WORDS[raw.trim()]; return w && /^\d+$/.test(w) ? Number(w) : null;
}
