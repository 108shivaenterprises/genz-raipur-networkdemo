/**
 * v109 — dormancy rescue. A verified broker who joined but has not done the first real thing (a listing, a client) is the cheapest growth to win back.
 * Pure: which nudge is due now. Nothing is sent by the app — the desk gets a ready text and one tap opens WhatsApp (no bulk messaging, so no consent exposure);
 * the same nudge is never offered twice (nudgedKind / nudgedAt on the user).
 */
export type NudgeKind = 'D3_FIRST_LISTING' | 'D7_FIRST_CLIENT' | 'D14_PERSONAL_CALL';
export interface RescueUser { verifiedAt?: string; createdAt?: string; lastLoginAt?: string; hasListing: boolean; hasClient: boolean; nudgedKind?: NudgeKind; nudgedAt?: string; optedOut?: boolean }
export interface Nudge { kind: NudgeKind; days: number; en: string; hi: string }
const DAY = 86_400_000;
const ORDER: NudgeKind[] = ['D3_FIRST_LISTING', 'D7_FIRST_CLIENT', 'D14_PERSONAL_CALL'];

export function daysSinceJoin(u: RescueUser, now: number): number | null {
  const t = Date.parse(u.verifiedAt || u.createdAt || ''); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
}
/** the nudge that is due now, or null (active, too new, nothing left to say, or the person asked to stop) */
export function nextNudge(u: RescueUser, first: string, now: number): Nudge | null {
  if (u.optedOut) return null;
  const d = daysSinceJoin(u, now); if (d === null) return null;
  const name = (first || '').trim().split(/\s+/)[0] || 'there';
  let kind: NudgeKind | null = null;
  if (!u.hasListing && !u.hasClient && d >= 14) kind = 'D14_PERSONAL_CALL';
  else if (!u.hasClient && d >= 7) kind = 'D7_FIRST_CLIENT';
  else if (!u.hasListing && !u.hasClient && d >= 3) kind = 'D3_FIRST_LISTING';
  if (!kind) return null;
  if (u.nudgedKind && ORDER.indexOf(u.nudgedKind) >= ORDER.indexOf(kind)) return null;   // that one (or a later one) was already offered
  const T: Record<NudgeKind, [string, string]> = {
    D3_FIRST_LISTING: [`Hi ${name}, welcome to GENZ Broker Network. Add your first listing in 2 minutes — verified partners get seen first. Reply STOP to stop messages.`,
      `नमस्ते ${name} जी, GENZ ब्रोकर नेटवर्क में स्वागत है। अपनी पहली लिस्टिंग 2 मिनट में जोड़ें — वेरिफ़ाइड पार्टनर पहले दिखते हैं। संदेश बंद करने के लिए STOP लिखें।`],
    D7_FIRST_CLIENT: [`Hi ${name}, register your first client on a project to get the 60-day protection and builder visibility. Need help? Reply here. Reply STOP to stop messages.`,
      `नमस्ते ${name} जी, किसी प्रोजेक्ट पर अपना पहला ग्राहक दर्ज करें — 60 दिन की सुरक्षा और बिल्डर तक पहुँच मिलेगी। मदद चाहिए तो जवाब दें। बंद करने के लिए STOP लिखें।`],
    D14_PERSONAL_CALL: [`Hi ${name}, our team would like to help you get set up on GENZ Broker Network — a 5-minute call? Reply STOP to stop messages.`,
      `नमस्ते ${name} जी, GENZ ब्रोकर नेटवर्क पर शुरुआत में हमारी टीम मदद करना चाहती है — 5 मिनट की कॉल? बंद करने के लिए STOP लिखें।`],
  };
  return { kind, days: d, en: T[kind][0], hi: T[kind][1] };
}
