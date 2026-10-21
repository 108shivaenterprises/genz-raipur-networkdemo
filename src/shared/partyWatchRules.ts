/** v35 — Network Watch: shared words and limits (server + screens) */
export const WATCH_CATEGORIES = [
  { id: 'COMMISSION_REFUSED', en: 'Refused to pay the broker’s commission', hi: 'ब्रोकर का कमीशन देने से मना किया' },
  { id: 'WENT_DIRECT', en: 'Went around the broker and dealt directly with the other party', hi: 'ब्रोकर को छोड़कर दूसरी पार्टी से सीधा सौदा किया' },
  { id: 'FAKE_ENQUIRY', en: 'Fake enquiry — only collecting details of properties / owners', hi: 'नकली पूछताछ — सिर्फ़ प्रॉपर्टी / मालिक की जानकारी निकालने के लिए' },
  { id: 'ABUSIVE', en: 'Abusive or threatening towards the broker', hi: 'ब्रोकर से गाली-गलौज या धमकी' },
] as const;
export type WatchCategory = typeof WATCH_CATEGORIES[number]['id'];
export const WATCH_EVIDENCE = [
  { id: 'VISIT', en: 'A site visit I scheduled for this person', hi: 'मैंने इसके लिए जो साइट विज़िट रखी' },
  { id: 'OFFER', en: 'An offer I made for this buyer', hi: 'इस खरीदार के लिए मेरा ऑफ़र' },
  { id: 'BOND', en: 'A buyer bond I hold', hi: 'मेरा खरीदार बॉन्ड' },
  { id: 'ROOM', en: 'My client room with this person', hi: 'इस व्यक्ति के साथ मेरा क्लाइंट रूम' },
  { id: 'CONSENT', en: 'An owner consent I sent', hi: 'मेरा भेजा मालिक-सहमति अनुरोध' },
] as const;
export const WATCH_LIMITS = {
  /** distinct brokers with verified evidence → CAUTION */ verifiedForCaution: 2,
  /** distinct brokers, even without evidence → CAUTION */ anyForCaution: 3,
  /** reports older than this stop counting towards CAUTION */ reportDays: 180,
  /** a staff block ends after this (then it is reviewed again) */ blockDays: 365,
  /** a broker with this many dismissed (false) reports in a year cannot report any more */ falseLimit: 3,
  noteMin: 15, perDay: 5, checkPerHour: 60,
};
export const WATCH_LEVEL_TEXT = {
  CAUTION: { en: 'Network caution: GENZ brokers have reported this mobile for refusing commission / dealing directly. Keep the broker’s role in writing and ask for the commission terms before the visit.', hi: 'नेटवर्क चेतावनी: इस मोबाइल के बारे में GENZ ब्रोकरों ने कमीशन न देने / सीधा सौदा करने की रिपोर्ट की है। विज़िट से पहले ब्रोकर की भूमिका और कमीशन की शर्तें लिखित में तय कर लें।' },
  BLOCKED: { en: 'Blocked by GENZ: this mobile cannot be used for visits, offers, client rooms or listings on GENZ because of confirmed commission bypass.', hi: 'GENZ द्वारा ब्लॉक: पक्के कमीशन-बायपास की वजह से यह मोबाइल GENZ पर विज़िट, ऑफ़र, क्लाइंट रूम या लिस्टिंग के लिए इस्तेमाल नहीं हो सकता।' },
} as const;
