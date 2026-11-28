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
  // D23 round 12 — co-broke, disputes, profile and photo
  ['Only brokers can propose co-broking collaborations', 'को-ब्रोकिंग का प्रस्ताव सिर्फ़ ब्रोकर दे सकते हैं'],
  ['Validation error', 'दी गई जानकारी जाँचें'],
  ['Property not found or not open for collaboration', 'प्रॉपर्टी नहीं मिली या को-ब्रोक के लिए खुली नहीं है'],
  ['Requirement not found', 'ज़रूरत नहीं मिली'],
  ['This listing has no broker on the network. Name the receiving broker explicitly.', 'इस लिस्टिंग का नेटवर्क पर कोई ब्रोकर नहीं है। जिस ब्रोकर को भेजना है उसका नाम साफ़ लिखें।'],
  ['You cannot propose a collaboration to yourself — choose the partner broker.', 'आप ख़ुद को प्रस्ताव नहीं भेज सकते — पार्टनर ब्रोकर चुनें।'],
  ['The receiving party must be a verified broker on the network', 'जिसे भेजा जा रहा है वह नेटवर्क का वेरिफ़ाइड ब्रोकर होना चाहिए'],
  ['You list this property, so you are the seller-side broker.', 'यह प्रॉपर्टी आपकी लिस्ट की हुई है, इसलिए आप विक्रेता की तरफ़ के ब्रोकर हैं।'],
  ['The other broker lists this property, so he is the seller-side broker and you act for the buyer.', 'यह प्रॉपर्टी दूसरे ब्रोकर ने लिस्ट की है, इसलिए वे विक्रेता की तरफ़ हैं और आप खरीदार की तरफ़।'],
  ['Terms and brokerage split notes required', 'शर्तें और ब्रोकरेज बँटवारे के नोट्स लिखना ज़रूरी है'],
  ['Proposed commission allocations must equal exactly 100%', 'प्रस्तावित कमीशन हिस्से मिलकर ठीक 100% होने चाहिए'],
  ['Say which side you act for: seller or buyer', 'बताएँ आप किस तरफ़ हैं: विक्रेता या खरीदार'],
  ['Confirm that the customer agreed to share their details', 'पुष्टि करें कि ग्राहक ने अपनी जानकारी साझा करने की सहमति दी है'],
  ['Please provide detailed factual description of the dispute', 'कृपया विवाद का विस्तृत और तथ्यात्मक विवरण लिखें (कम से कम 15 अक्षर)'],
  ['GENZ staff do not have a profile.', 'GENZ स्टाफ़ की अपनी प्रोफ़ाइल नहीं होती।'],
  ['Visible must be on or off', 'दिखना चालू या बंद में से एक होना चाहिए'],
  ['Photo must be on or off', 'फ़ोटो दिखाना चालू या बंद में से एक होना चाहिए'],
  ['Choose up to 4 of the listed specialities', 'सूची में से अधिकतम 4 विशेषताएँ चुनें'],
  ['Years of work must be 0 to 60', 'काम के साल 0 से 60 के बीच होने चाहिए'],
  ['Please do not put links or email addresses in a review', 'रिव्यू में लिंक या ई-मेल पता न लिखें'],
  ['Please do not put phone numbers in a review', 'रिव्यू में फ़ोन नंबर न लिखें'],
  ['Please do not put links or email addresses in your profile', 'अपनी प्रोफ़ाइल में लिंक या ई-मेल पता न लिखें'],
  ['Please do not put phone numbers in your profile', 'अपनी प्रोफ़ाइल में फ़ोन नंबर न लिखें'],
  ['The photo could not be read. Please choose it again.', 'फ़ोटो पढ़ी नहीं जा सकी। कृपया उसे दोबारा चुनें।'],
  ['The photo is too big. Take it again or pick a smaller one.', 'फ़ोटो बहुत बड़ी है। दोबारा खींचें या छोटी चुनें।'],
  ['Only a JPEG, PNG or WebP photo is accepted.', 'सिर्फ़ JPEG, PNG या WebP फ़ोटो मान्य है।'],
  ['Request body too large', 'भेजी गई फ़ाइल या डेटा बहुत बड़ा है — छोटी फ़ाइल चुनें या फ़ोटो छोटी करें।'],
]);
/** messages with a number or a name inside */
const HI_RX: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Keep "about" under (\d+) characters$/, m => `"अपने बारे में" ${m[1]} अक्षर से कम रखें`],
  [/^Keep it under (\d+) characters$/, m => `इसे ${m[1]} अक्षर से कम रखें`],
  [/^Check (areas|languages)$/, m => m[1] === 'areas' ? 'इलाके जाँचें (अधिकतम 6, हर एक 2 से 30 अक्षर)' : 'भाषाएँ जाँचें (अधिकतम 5, हर एक 2 से 30 अक्षर)'],
  [/^Offer is already (\w+)$/, m => `यह ऑफ़र पहले ही ${({ accepted: 'मंज़ूर', rejected: 'अस्वीकार', expired: 'समाप्त', withdrawn: 'वापस' } as Record<string, string>)[m[1].toLowerCase()] || 'बंद'} हो चुका है`],
];

export function hindiErrors(_req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    const b = body as { error?: unknown; errorHi?: unknown } | null;
    if (b && typeof b === 'object' && typeof b.error === 'string' && !b.errorHi) { const hi = HI.get(b.error) || (() => { for (const [rx, f] of HI_RX) { const m = (b.error as string).match(rx); if (m) return f(m); } return undefined; })(); if (hi) return json({ ...b, errorHi: hi }); }
    return json(body);
  };
  next();
}
