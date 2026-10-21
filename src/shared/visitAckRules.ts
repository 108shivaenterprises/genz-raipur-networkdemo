/**
 * v33 — Visit acknowledgement ("no direct deal"): before a buyer gets the visit QR / code he ticks a promise and confirms his own mobile
 * with a code. Wording is versioned so a dispute can show exactly what the buyer agreed to. Pure — used by the server and the screens.
 */
export const ACK_VERSION = 'v1';
export const ACK_LIMITS = { otpMinutes: 10, otpTries: 5, askPerHour: 8 } as const;
export type AckKind = 'PASS' | 'VISIT';

/** the promise the buyer ticks; `who` is the introducing broker, `what` the project / property */
export const ackText = (who: string, what: string) => ({
  hi: `मैं मानता/मानती हूँ कि “${what}” की यह विज़िट ${who} के ज़रिए हो रही है। सुरक्षा अवधि के दौरान मैं इस प्रॉपर्टी / प्रोजेक्ट के मालिक या बिल्डर से, या उनकी ओर से किसी से, ${who} को बीच में रखे बिना सीधे सौदा, बातचीत या भुगतान नहीं करूँगा/करूँगी।`,
  en: `I confirm that this visit to “${what}” is arranged through ${who}. During the protection period I will not deal, negotiate or pay directly with the owner or builder of this property / project, or anyone on their behalf, without ${who} being involved.`,
});
export const ACK_NOTE = {
  hi: 'यह आपकी सहमति का रिकॉर्ड है। GENZ आपसे कोई पैसा नहीं लेता। आपका मोबाइल सिर्फ़ एक-तरफ़ा हैश और आख़िरी 4 अंकों के रूप में रखा जाता है।',
  en: 'This is a record of your agreement. GENZ takes no money from you. Your mobile is kept only as a one-way hash plus its last 4 digits.',
};
