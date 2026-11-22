/**
 * v178 — Hindi for server errors that have no `errorHi` yet. One table, one wrapper: when a JSON error body carries an English
 * message listed here, `errorHi` is added (the screen shows it in Hindi). Strings not listed are untouched.
 */
import type { Request, Response, NextFunction } from 'express';
import { NO_CONTACT_MSG } from './validation.js';

const HI = new Map<string, string>([
  [NO_CONTACT_MSG, 'यहाँ फ़ोन नंबर, ई-मेल, UPI, Instagram / Telegram ID या चैट लिंक न लिखें — GENZ ख़ुद लोगों को जोड़ता है (चैट, विज़िट, कॉल)।'],
  ['Phone numbers cannot be shared in the deal room — it is seen by both sides. Use the in-app call, or the visit / deal tools.', 'डील रूम में फ़ोन नंबर साझा नहीं किए जा सकते — इसे दोनों पक्ष देखते हैं। ऐप की कॉल या विज़िट / डील टूल इस्तेमाल करें।'],
  ['E-mail, UPI, Instagram / Telegram IDs and chat links cannot be shared in the deal room — it is seen by both sides. Use the in-app chat, call, or the visit / deal tools.', 'डील रूम में ई-मेल, UPI, Instagram / Telegram ID और चैट लिंक साझा नहीं किए जा सकते — इसे दोनों पक्ष देखते हैं। ऐप की चैट, कॉल या विज़िट / डील टूल इस्तेमाल करें।'],
  ['Please provide a valid Indian 10-digit mobile number (+91 9XXXX XXXXX)', '10 अंकों का सही भारतीय मोबाइल नंबर लिखें (+91 9XXXX XXXXX)'],
  ['Password is required', 'पासवर्ड ज़रूरी है'],
  ['Password must be at least 10 characters', 'पासवर्ड कम से कम 10 अक्षर का होना चाहिए'],
  ['Password is too long', 'पासवर्ड बहुत लंबा है'],
  ['Password must contain upper-case, lower-case and a digit', 'पासवर्ड में एक बड़ा अक्षर, एक छोटा अक्षर और एक अंक होना चाहिए'],
  ['Please describe your request', 'कृपया अपना अनुरोध लिखें'],
  ['Invalid request type', 'अनुरोध का प्रकार सही नहीं है'],
  ['You already have an open request of this type', 'इस प्रकार का आपका एक अनुरोध पहले से खुला है'],
  ['Enter your 10-digit mobile number', '10 अंकों का मोबाइल नंबर लिखें'],
  ['The new visit time is in the past', 'विज़िट का नया समय बीत चुका है — अब से आगे का समय चुनें'],
  ['Pick a valid visit date and time', 'विज़िट की सही तारीख़ और समय चुनें'],
  ['The visit can be moved at most 30 days ahead', 'विज़िट को ज़्यादा से ज़्यादा 30 दिन आगे तक ही खिसकाया जा सकता है'],
  ['Visit time is required', 'विज़िट का समय ज़रूरी है'],
  ['Customer name is required', 'ग्राहक का नाम ज़रूरी है'],
]);

export function hindiErrors(_req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    const b = body as { error?: unknown; errorHi?: unknown } | null;
    if (b && typeof b === 'object' && typeof b.error === 'string' && !b.errorHi) { const hi = HI.get(b.error); if (hi) return json({ ...b, errorHi: hi }); }
    return json(body);
  };
  next();
}
