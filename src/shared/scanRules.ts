/**
 * v102 — what a QR the broker scans at the property (home QR button / Visit QR screen) actually IS.
 * The scanner used to say "This is not a GENZ visit QR. Ask the buyer to open his pass again" for EVERY other GENZ QR too
 * (a shop QR, a broker card, an owner-consent link, a bill …) — wrong and confusing. Now each kind is named, and who it is for.
 * Pure — the screens only pick the words.
 */
export type OtherQrKind = 'BUYER_PROMISE' | 'SHOP_QR' | 'BROKER_CARD' | 'OWNER_CONSENT' | 'BILL' | 'SHARED_LISTING' | 'PARTNER_PAGE';
/** path prefix of a GENZ page → kind. The token must look like a token (not “/c/” alone), so a random website is not mistaken for ours. */
const PATHS: { re: RegExp; kind: OtherQrKind }[] = [
  { re: /^\/a\/[a-f0-9]{10}-[a-f0-9]{24}\/?$/i, kind: 'BUYER_PROMISE' },
  { re: /^\/q\/(chat\/)?[A-Za-z0-9_-]{6,}\/?$/, kind: 'SHOP_QR' },
  { re: /^\/sp\/[A-Za-z0-9_-]{10,}\/?$/, kind: 'PARTNER_PAGE' },
  { re: /^\/oc\/[A-Za-z0-9_-]{10,}\/?$/, kind: 'OWNER_CONSENT' },
  { re: /^\/pay\/[A-Za-z0-9_-]{10,}\/?$/, kind: 'BILL' },
  { re: /^\/s\/[A-Za-z0-9_-]{6,}\/?$/, kind: 'SHARED_LISTING' },
  { re: /^\/c\/[A-Za-z0-9_-]{4,}\/?$/, kind: 'BROKER_CARD' },
];
/** what a scanned text is, if it is one of the other GENZ page links (an absolute link on any host, or just the path) */
export function otherGenzQr(raw: string): OtherQrKind | '' {
  const t = String(raw || '').trim(); if (!t || t.length > 600 || /\s/.test(t)) return '';
  let path = ''; if (t.startsWith('/')) path = t.split(/[?#]/)[0]; else { try { const u = new URL(t); if (!/^https?:$/.test(u.protocol)) return ''; path = u.pathname; } catch { return ''; } }
  return PATHS.find(p => p.re.test(path))?.kind || '';
}
export const OTHER_QR_WORDS: Record<OtherQrKind, { en: string; hi: string }> = {
  BUYER_PROMISE: {
    en: 'This is the buyer’s “no direct deal” promise link, not his visit pass. He opens it on his own phone, ticks and enters his mobile code — only then his pass QR appears there. Scan THAT.',
    hi: 'यह खरीदार का “सीधा सौदा नहीं” वाला सहमति लिंक है, विज़िट पास नहीं। वह इसे अपने फ़ोन पर खोलकर टिक करे और मोबाइल कोड डाले — तभी उसका पास QR वहाँ दिखेगा। वही स्कैन करें।',
  },
  SHOP_QR: {
    en: 'This is a broker’s shop QR — customers scan it with the phone camera to talk to that broker. It is not a visit pass, so there is nothing to verify here.',
    hi: 'यह किसी ब्रोकर का शॉप QR है — ग्राहक इसे फ़ोन कैमरे से स्कैन करके उस ब्रोकर से बात करते हैं। यह विज़िट पास नहीं है, यहाँ वेरिफाई करने को कुछ नहीं।',
  },
  PARTNER_PAGE: {
    en: 'This is a shop-partner link, not a visit pass. The shop owner opens it on his own phone.',
    hi: 'यह शॉप-पार्टनर का लिंक है, विज़िट पास नहीं। दुकान वाला इसे अपने फ़ोन पर खोलता है।',
  },
  OWNER_CONSENT: {
    en: 'This is an owner-consent link — the property owner opens it to allow a listing. It is not a visit pass.',
    hi: 'यह मालिक की सहमति का लिंक है — प्रॉपर्टी मालिक इसे लिस्टिंग की अनुमति देने के लिए खोलता है। यह विज़िट पास नहीं है।',
  },
  BILL: {
    en: 'This is a payment bill link — the person who has to pay opens it. It is not a visit pass.',
    hi: 'यह भुगतान के बिल का लिंक है — जिसे भुगतान करना है वह इसे खोलता है। यह विज़िट पास नहीं है।',
  },
  SHARED_LISTING: {
    en: 'This is a shared property link, not a visit pass. Open it to look at the property.',
    hi: 'यह शेयर की गई प्रॉपर्टी का लिंक है, विज़िट पास नहीं। प्रॉपर्टी देखने के लिए इसे खोलें।',
  },
  BROKER_CARD: {
    en: 'This is a broker’s card / page for sharing, not a visit pass. To verify a visit, scan the buyer’s pass QR.',
    hi: 'यह किसी ब्रोकर का कार्ड / पेज है जो शेयर करने के लिए होता है, विज़िट पास नहीं। विज़िट वेरिफाई करने के लिए खरीदार का पास QR स्कैन करें।',
  },
};
/** the line for anything that is not a GENZ QR at all */
export const NOT_GENZ_QR = {
  en: 'This is not a GENZ visit QR. Ask the buyer to open his pass from the GENZ link again.',
  hi: 'यह GENZ का विज़िट QR नहीं है। खरीदार से GENZ लिंक से अपना पास दोबारा खुलवाएँ।',
};
