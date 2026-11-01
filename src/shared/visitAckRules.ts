/**
 * v33 — Visit acknowledgement ("no direct deal"): before a buyer gets the visit QR / code he ticks a promise and confirms his own mobile
 * with a code. Wording is versioned so a dispute can show exactly what the buyer agreed to. Pure — used by the server and the screens.
 */
/** v1 — buyer promises not to deal directly with the owner / builder. v2 (v102) — also covers his family, relatives, nominee and any firm of theirs, names BOTH brokers of a broker-to-broker visit, and says the agreed commission is then payable. */
export const ACK_VERSION = 'v2';
export const ACK_LIMITS = { otpMinutes: 10, otpTries: 5, askPerHour: 8 } as const;
export type AckKind = 'PASS' | 'VISIT';

/** the promise the buyer ticks; `who` is the introducing broker, `what` the project / property, `also` the OTHER broker of a broker-to-broker visit (the property's listing broker) */
export const ackText = (who: string, what: string, also?: string) => {
  const hiWho = also ? `${who} और ${also}` : who; const enWho = also ? `${who} and ${also}` : who;
  return {
    hi: `मैं मानता/मानती हूँ कि “${what}” की यह विज़िट ${hiWho} के ज़रिए हो रही है। सुरक्षा अवधि के दौरान मैं, मेरे परिवार का कोई सदस्य, मेरा कोई रिश्तेदार, मेरा नॉमिनी, या मेरी / उनकी कोई फ़र्म या कंपनी — कोई भी — इस प्रॉपर्टी / प्रोजेक्ट को ${hiWho} को बीच में रखे बिना न ख़रीदेगा / न किराये पर लेगा, और इसके मालिक या बिल्डर से, या उनकी ओर से किसी से, सीधे सौदा, बातचीत या भुगतान नहीं करेगा। अगर ऐसा हुआ तो मैं मानता/मानती हूँ कि सौदा ${hiWho} के ज़रिए ही हुआ, और तय कमीशन उन्हें देना होगा।`,
    en: `I confirm that this visit to “${what}” is arranged through ${enWho}. During the protection period neither I, nor any member of my family, any relative of mine, my nominee, nor any firm or company of mine or theirs, will buy or rent this property / project without ${enWho} being involved, or deal, negotiate or pay directly with the owner or builder of it, or anyone on their behalf. If this happens, I agree that the deal was made through ${enWho} and the agreed commission is payable to them.`,
  };
};
/** the wording a given acknowledgement was shown / agreed under — an older pending one keeps its own words */
export const ackTextFor = (version: string | undefined, who: string, what: string, also?: string) => version === 'v1'
  ? {
    hi: `मैं मानता/मानती हूँ कि “${what}” की यह विज़िट ${who} के ज़रिए हो रही है। सुरक्षा अवधि के दौरान मैं इस प्रॉपर्टी / प्रोजेक्ट के मालिक या बिल्डर से, या उनकी ओर से किसी से, ${who} को बीच में रखे बिना सीधे सौदा, बातचीत या भुगतान नहीं करूँगा/करूँगी।`,
    en: `I confirm that this visit to “${what}” is arranged through ${who}. During the protection period I will not deal, negotiate or pay directly with the owner or builder of this property / project, or anyone on their behalf, without ${who} being involved.`,
  }
  : ackText(who, what, also);
export const ACK_NOTE = {
  hi: 'यह आपकी सहमति का रिकॉर्ड है। GENZ आपसे कोई पैसा नहीं लेता। आपका मोबाइल सिर्फ़ एक-तरफ़ा हैश और आख़िरी 4 अंकों के रूप में रखा जाता है।',
  en: 'This is a record of your agreement. GENZ takes no money from you. Your mobile is kept only as a one-way hash plus its last 4 digits.',
};
