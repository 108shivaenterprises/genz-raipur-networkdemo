/**
 * Property Papers library — shared by the server (validation, search) and the client (labels).
 * `words` are extra search terms (Hindi + common spellings) so that "registry", "रजिस्ट्री" and "baina" all find a sale deed.
 */
export const PROP_DOC_TYPES = [
  { id: 'SALE_DEED', en: 'Sale deed / Registry', hi: 'रजिस्ट्री / सेल डीड', words: 'sale deed registry registration baina बैनामा रजिस्ट्री विक्रय' },
  { id: 'KHASRA_B1', en: 'Khasra / B-1 / Khatauni / 7-12', hi: 'खसरा / B-1 / खतौनी / 7-12', words: 'khasra b1 b-1 khatauni 7/12 patta land record खसरा खतौनी नकल भू अभिलेख' },
  { id: 'MUTATION', en: 'Mutation (naamantaran)', hi: 'नामांतरण', words: 'mutation namantaran naamantran नामांतरण दाखिल खारिज' },
  { id: 'LAYOUT_MAP', en: 'Layout / Naksha / Site plan', hi: 'नक्शा / लेआउट / साइट प्लान', words: 'layout naksha nakshe map site plan tncp नक्शा लेआउट' },
  { id: 'FLOOR_PLAN', en: 'Floor plan / Building plan', hi: 'फ़्लोर प्लान / भवन नक्शा', words: 'floor plan building plan sanctioned नक्शा भवन' },
  { id: 'TITLE_REPORT', en: 'Title report / Legal opinion', hi: 'टाइटल रिपोर्ट / कानूनी राय', words: 'title report legal opinion search report advocate वकील टाइटल राय' },
  { id: 'ENCUMBRANCE', en: 'Encumbrance / No-dues', hi: 'भार-मुक्त प्रमाणपत्र / बकाया-मुक्त', words: 'encumbrance ec form 15 no dues bhar mukt भार मुक्त' },
  { id: 'TAX_RECEIPT', en: 'Property tax receipt', hi: 'संपत्ति कर रसीद', words: 'property tax receipt nagar nigam municipal house tax कर रसीद नगर निगम' },
  { id: 'UTILITY_BILL', en: 'Electricity / water bill', hi: 'बिजली / पानी का बिल', words: 'electricity bill water bill light bill बिजली बिल पानी' },
  { id: 'NOC', en: 'NOC (society / authority / bank)', hi: 'NOC (सोसाइटी / प्राधिकरण / बैंक)', words: 'noc no objection society authority bank एनओसी अनापत्ति' },
  { id: 'RERA_CERT', en: 'RERA certificate', hi: 'RERA प्रमाणपत्र', words: 'rera certificate registration project रेरा' },
  { id: 'SANCTION_OC_CC', en: 'Sanction / OC / CC / Diversion order', hi: 'मंज़ूरी / OC / CC / डायवर्सन आदेश', words: 'sanction oc cc occupancy completion diversion order demarcation मंजूरी डायवर्सन' },
  { id: 'POA_MANDATE', en: 'Power of attorney / Authority letter', hi: 'मुख्तारनामा / अथॉरिटी लेटर', words: 'power of attorney poa authority letter mandate muktyarnama मुख्तारनामा' },
  { id: 'AGREEMENT', en: 'Agreement to sell / Lease / Rent', hi: 'बयाना / किरायानामा / एग्रीमेंट', words: 'agreement to sell lease rent agreement baiyana kirayanama बयाना किरायानामा एग्रीमेंट' },
  { id: 'LOAN_PAPERS', en: 'Loan / Mortgage papers', hi: 'लोन / बंधक के कागज़', words: 'loan mortgage bank sanction release लोन बंधक' },
  { id: 'OTHER', en: 'Other paper', hi: 'अन्य कागज़', words: 'other misc अन्य' },
] as const;
export type PropDocType = (typeof PROP_DOC_TYPES)[number]['id'];
export const PROP_DOC_TYPE_IDS = PROP_DOC_TYPES.map(t => t.id) as [PropDocType, ...PropDocType[]];

export const PROP_DOC_VISIBILITY = ['PRIVATE', 'DEAL_PARTICIPANTS', 'VERIFIED_BROKERS'] as const;
export type PropDocVisibility = (typeof PROP_DOC_VISIBILITY)[number];

/** Only these file kinds are accepted (checked against the real bytes, not the file name). */
export const PROP_DOC_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const PROP_DOC_MAX_BYTES = 10 * 1024 * 1024;
export const PROP_DOC_MAX_PER_PROPERTY = 80;
export const PROP_DOC_MAX_USER_BYTES = 400 * 1024 * 1024;

export const propDocTypeLabel = (id: string, hi = false) => { const x = PROP_DOC_TYPES.find(t => t.id === id); return x ? (hi ? x.hi : x.en) : id; };

/** lower-case, strip punctuation, keep letters/digits of every script */
export const normSearch = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();

/** Every search word must appear somewhere in the haystack ("khasra 142 raipur"). */
export function matchesQuery(haystack: string, q: string): boolean {
  const words = normSearch(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const h = normSearch(haystack);
  return words.every(w => h.includes(w));
}

/** Detect the real kind of a file from its first bytes. Returns null for anything that is not a PDF / JPEG / PNG / WebP. */
export function sniffMime(b: Uint8Array): (typeof PROP_DOC_MIMES)[number] | null {
  if (b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
