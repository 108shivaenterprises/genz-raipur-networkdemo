/**
 * Cactus Bridge: delegates to native on-device Cactus SDK (`window.CactusNativeBridge`)
 * when available, with a deterministic Hinglish/English local parser fallback.
 */

export type CactusPartnerCategory =
  | 'Painter'
  | 'Carpenter'
  | 'Tiles'
  | 'Architect'
  | 'Cleaning'
  | 'Thekedar';

export interface ParsedContractorQuote {
  invoiceAmountInr: number | null;
  partnerCategory?: CactusPartnerCategory;
  partnerName?: string;
  invoiceRef?: string;
  summary?: string;
  engine: 'cactus-native' | 'local-parser';
  confidence?: 'high' | 'medium' | 'low';
}

export interface PropertyVoiceParseInput {
  transcript: string;
  locale?: string;
}

export interface PropertyVoiceParseResult {
  engine: 'cactus-native' | 'stub';
  priceInr: number | null;
  rawTranscript: string;
}

interface NativeBridge {
  isReady?: () => boolean;
  parseQuote?: (text: string) => Promise<Partial<ParsedContractorQuote>>;
  parsePropertyVoice?: (input: PropertyVoiceParseInput) => Promise<Partial<PropertyVoiceParseResult>>;
}

interface AndroidNativeBridge {
  isReady?: () => boolean;
  getStatusJson?: () => string;
  parseQuoteJson?: (text: string) => string;
}

function getNativeBridge(): NativeBridge | undefined {
  if (typeof globalThis.window === 'undefined') return undefined;
  return (globalThis.window as unknown as { CactusNativeBridge?: NativeBridge }).CactusNativeBridge;
}

function getAndroidNativeBridge(): AndroidNativeBridge | undefined {
  if (typeof globalThis.window === 'undefined') return undefined;
  return (globalThis.window as unknown as { CactusNativeAndroid?: AndroidNativeBridge }).CactusNativeAndroid;
}

export function isCactusNativeAvailable(): boolean {
  const androidBridge = getAndroidNativeBridge();
  if (androidBridge) {
    return typeof androidBridge.isReady === 'function' ? Boolean(androidBridge.isReady()) : true;
  }
  const bridge = getNativeBridge();
  if (!bridge) return false;
  return typeof bridge.isReady === 'function' ? Boolean(bridge.isReady()) : true;
}

const CATEGORY_PATTERNS: Array<{ category: CactusPartnerCategory; pattern: RegExp }> = [
  { category: 'Painter', pattern: /\b(paint|painter|painting|putty|emulsion|distemper|asian\s*paints|berger|रंग|पुताई|पेंटर)\b/i },
  { category: 'Carpenter', pattern: /\b(carpenter|woodwork|modular|kitchen|wardrobe|plywood|furniture|कारपेंटर|बढ़ई|मॉड्यूलर|किचन)\b/i },
  { category: 'Architect', pattern: /\b(architect|interior|design|elevation|naksha|3d\s*render|false\s*ceiling|आर्किटेक्ट|इंटीरियर|डिज़ाइन)\b/i },
  { category: 'Tiles', pattern: /\b(tile|tiles|vitrified|kajaria|marble|granite|flooring|italian\s*marble|टाइल्स|मार्बल|ग्रेनाइट)\b/i },
  { category: 'Cleaning', pattern: /\b(clean|cleaning|deep\s*clean|sanitiz\w*|pest\s*control|सफाई|डीप\s*क्लीनिंग)\b/i },
  { category: 'Thekedar', pattern: /\b(thekedar|civil|contractor|renovation|masonry|plaster|brick|cement|construction|ठेकेदार|सिविल|निर्माण)\b/i },
];

function parseIndianAmount(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const shorthand = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:[.,]\d+)?)\s*(cr|crore|l|lac|lakh|lakhs|k)\b/i);
  if (shorthand) {
    const num = parseFloat(shorthand[1].replace(/,/g, ''));
    const unit = shorthand[2].toLowerCase();
    if (!Number.isFinite(num)) return null;
    if (unit === 'k') return Math.round(num * 1_000);
    if (unit.startsWith('l')) return Math.round(num * 100_000);
    if (unit.startsWith('cr')) return Math.round(num * 10_000_000);
  }

  const currency = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (currency) {
    const num = parseFloat(currency[1].replace(/,/g, ''));
    if (Number.isFinite(num) && num > 0) return Math.round(num);
  }

  const nums = Array.from(text.matchAll(/\b(\d[\d,]{2,})\b/g))
    .map((m) => parseFloat(m[1].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n >= 500);
  if (nums.length > 0) {
    return Math.round(Math.max(...nums));
  }
  return null;
}

export async function parseQuoteWithCactus(quoteText: string): Promise<ParsedContractorQuote> {
  const text = (quoteText || '').trim();
  if (!text) return { invoiceAmountInr: null, engine: 'local-parser', confidence: 'low' };

  const androidBridge = getAndroidNativeBridge();
  if (isCactusNativeAvailable() && androidBridge?.parseQuoteJson) {
    try {
      const rawJson = androidBridge.parseQuoteJson(text);
      const nativeRes = JSON.parse(rawJson) as Partial<ParsedContractorQuote>;
      if (nativeRes && typeof nativeRes === 'object') {
        return {
          invoiceAmountInr: nativeRes.invoiceAmountInr ?? null,
          partnerCategory: nativeRes.partnerCategory,
          partnerName: nativeRes.partnerName,
          invoiceRef: nativeRes.invoiceRef,
          summary: nativeRes.summary,
          engine: 'cactus-native',
          confidence: nativeRes.confidence ?? 'high',
        };
      }
    } catch {
      // Fall back to JS bridge or local parser
    }
  }

  const bridge = getNativeBridge();
  if (isCactusNativeAvailable() && bridge?.parseQuote) {
    try {
      const nativeRes = await bridge.parseQuote(text);
      if (nativeRes && typeof nativeRes === 'object') {
        return {
          invoiceAmountInr: nativeRes.invoiceAmountInr ?? null,
          partnerCategory: nativeRes.partnerCategory,
          partnerName: nativeRes.partnerName,
          invoiceRef: nativeRes.invoiceRef,
          summary: nativeRes.summary,
          engine: 'cactus-native',
        };
      }
    } catch {
      // Fall back to local parser on native bridge error
    }
  }

  const invoiceAmountInr = parseIndianAmount(text);

  let partnerCategory: CactusPartnerCategory | undefined;
  for (const entry of CATEGORY_PATTERNS) {
    if (entry.pattern.test(text)) {
      partnerCategory = entry.category;
      break;
    }
  }

  let partnerName: string | undefined;
  const nameMatch = text.match(/(?:from|by|vendor|contractor|partner|m\/s)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s&.'-]{2,35})/i);
  if (nameMatch?.[1]) {
    partnerName = nameMatch[1].replace(/\s+(?:for|quote|bill|invoice|amount).*$/i, '').trim();
  }

  let invoiceRef: string | undefined;
  const refMatch = text.match(/(?:inv(?:oice)?|bill|quote|ref)\s*(?:no\.?|#|id)?\s*[:\-]?\s*([A-Z0-9\-\/]{3,24})/i);
  if (refMatch?.[1]) {
    invoiceRef = refMatch[1].trim();
  }

  const signals = [invoiceAmountInr !== null, Boolean(partnerCategory), Boolean(partnerName), Boolean(invoiceRef)].filter(Boolean).length;
  const confidence: ParsedContractorQuote['confidence'] = signals >= 3 ? 'high' : signals >= 1 ? 'medium' : 'low';

  return { invoiceAmountInr, partnerCategory, partnerName, invoiceRef, engine: 'local-parser', confidence };
}

export async function parsePropertyVoiceWithCactus(
  input: PropertyVoiceParseInput,
): Promise<PropertyVoiceParseResult> {
  const rawTranscript = (input?.transcript || '').trim();
  return {
    engine: 'stub',
    priceInr: parseIndianAmount(rawTranscript),
    rawTranscript,
  };
}
