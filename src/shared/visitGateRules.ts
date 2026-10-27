/**
 * v79 — “can THIS person confirm this site visit right now, and if not, why and what next?”
 *
 * One pure function used by the server (to refuse) and by the screens (to explain BEFORE the person taps), so the two can never
 * disagree. The order is the old `loadVerifiableVisit` order, unchanged:
 *   1. maker ≠ checker  — whoever scheduled the visit never verifies it (unless he is also the owner of the property)
 *   2. only the property side: the owner, or the listing broker (not when the listing broker brought the buyer himself), or GENZ super admin
 *   3. already verified
 *   4. the buyer has not yet ticked “no direct deal”
 *   5. too early (more than 6 h before the slot)
 *   6. the 24 h window after the slot has closed
 *   7. 5 wrong tries — locked
 */
export type GateCode = 'OK' | 'DONE' | 'MAKER_CHECKER' | 'PROPERTY_SIDE_ONLY' | 'ACK_REQUIRED' | 'TOO_EARLY' | 'EXPIRED' | 'LOCKED';

export const EARLY_HOURS = 6;
export const WINDOW_HOURS = 24;
export const MAX_TRIES = 5;
/** a booked visit may be moved at most this far ahead */
export const RESCHEDULE_MAX_DAYS = 30;
/** the booker may nudge the property side at most this often */
export const REMIND_EVERY_MIN = 30;

export interface GateInput {
  isVerified: boolean;
  /** who scheduled (brought the buyer) */
  bookerId: string;
  userId: string;
  ownerId: string;
  listingBrokerId: string;
  isSuper: boolean;
  /** the buyer still has to confirm “no direct deal” */
  ackBlocked: boolean;
  scheduledAt: string;
  /** end of the window after the slot (ISO); old visits may have none */
  expiresAt?: string;
  attempts: number;
  now: number;
}

export interface Gate {
  code: GateCode;
  ok: boolean;
  /** the HTTP status the server answers with */
  status: number;
  /** the listing broker brought this buyer himself → only the owner may verify */
  selfDeal: boolean;
  /** this person is the property side (owner / listing broker) — whether or not it is open right now */
  propertySide: boolean;
}

export function visitGate(i: GateInput): Gate {
  const selfDeal = !!i.listingBrokerId && i.bookerId === i.listingBrokerId;
  const isOwner = !!i.ownerId && i.ownerId === i.userId;
  const propertySide = isOwner || (!!i.listingBrokerId && i.listingBrokerId === i.userId && !selfDeal);
  const g = (code: GateCode, status: number): Gate => ({ code, ok: code === 'OK', status, selfDeal, propertySide });
  if (i.bookerId === i.userId && !isOwner) return g('MAKER_CHECKER', 403);
  if (!propertySide && !i.isSuper) return g('PROPERTY_SIDE_ONLY', 403);
  if (i.isVerified) return g('DONE', 409);
  if (i.ackBlocked) return g('ACK_REQUIRED', 409);
  const sch = Date.parse(i.scheduledAt);
  if (Number.isFinite(sch) && i.now < sch - EARLY_HOURS * 3600_000) return g('TOO_EARLY', 400);
  if (i.expiresAt && i.now > Date.parse(i.expiresAt)) return g('EXPIRED', 410);
  if ((i.attempts || 0) >= MAX_TRIES) return g('LOCKED', 429);
  return g('OK', 200);
}

/** when the confirm window of a visit closes: 24 h after the later of (the slot, now) */
export function windowEnd(scheduledAt: string, now: number): string {
  const t = Date.parse(scheduledAt);
  return new Date(Math.max(Number.isFinite(t) ? t : now, now) + WINDOW_HOURS * 3600_000).toISOString();
}

/** may the booker move the visit to this new time? '' = fine, otherwise the reason (English, the server's wording) */
export function rescheduleError(newTime: string, now: number): string {
  const t = Date.parse(newTime);
  if (Number.isNaN(t)) return 'Pick a valid visit date and time';
  if (t < now - 2 * 3600_000) return 'The new visit time is in the past';
  if (t > now + RESCHEDULE_MAX_DAYS * 86400_000) return `The visit can be moved at most ${RESCHEDULE_MAX_DAYS} days ahead`;
  return '';
}

/** what the screen tells the viewer, by gate code. `by` = who confirms on the property side. */
export function gateWords(code: GateCode, o: { hi: boolean; selfDeal?: boolean; sch?: string; iAmBooker?: boolean }): { title: string; body: string } {
  const { hi } = o;
  const who = o.selfDeal ? (hi ? 'प्रॉपर्टी के मालिक' : 'the property owner') : (hi ? 'प्रॉपर्टी के मालिक या लिस्टिंग ब्रोकर' : 'the property owner or the listing broker');
  switch (code) {
    case 'MAKER_CHECKER': return {
      title: hi ? 'यह विज़िट आपने बुक की है' : 'You booked this visit',
      body: hi ? `अपनी ही बुक की हुई विज़िट आप खुद कन्फ़र्म नहीं कर सकते — यह GENZ का एंटी-बायपास नियम है। ${who} साइट पर ग्राहक का QR स्कैन करेंगे (या OTP डालेंगे)। नीचे “याद दिलाएँ” दबाकर उन्हें बता दें।`
        : `A visit you booked yourself cannot be confirmed by you — that is GENZ’s anti-bypass rule. ${who[0].toUpperCase() + who.slice(1)} scans the customer’s QR (or types the code) at the property. Tap “Remind” below to tell them.`,
    };
    case 'PROPERTY_SIDE_ONLY': return {
      title: hi ? 'इसे सिर्फ़ प्रॉपर्टी की तरफ़ वाले कन्फ़र्म करते हैं' : 'Only the property side confirms this',
      body: hi ? `${who} ही साइट पर यह विज़िट कन्फ़र्म कर सकते हैं।` : `Only ${who} can confirm this visit at the property.`,
    };
    case 'DONE': return { title: hi ? 'विज़िट कन्फ़र्म हो चुकी है' : 'Visit already confirmed', body: hi ? 'इस विज़िट का सबूत दर्ज है।' : 'The proof of this visit is already recorded.' };
    case 'ACK_REQUIRED': return {
      title: hi ? 'ग्राहक की “सीधा सौदा नहीं” पुष्टि बाकी' : 'Waiting for the buyer’s “no direct deal” tick',
      body: hi ? 'ग्राहक अपने लिंक पर टिक करके मोबाइल कोड डालेगा — तब QR और कोड खुलेंगे और विज़िट कन्फ़र्म हो सकेगी।' : 'The buyer ticks it on his link and types his mobile code — then the QR and code open and the visit can be confirmed.',
    };
    case 'TOO_EARLY': return {
      title: hi ? 'अभी जल्दी है' : 'Too early to confirm',
      body: hi ? `विज़िट के समय से ${EARLY_HOURS} घंटे पहले से कन्फ़र्म हो सकती है${o.sch ? ` (${o.sch})` : ''}।` : `A visit can be confirmed from ${EARLY_HOURS} hours before its time${o.sch ? ` (${o.sch})` : ''}.`,
    };
    case 'EXPIRED': return {
      title: hi ? 'इस विज़िट की समय-सीमा निकल गई' : 'This visit’s window has closed',
      body: o.iAmBooker
        ? (hi ? `विज़िट के ${WINDOW_HOURS} घंटे बाद पास बंद हो जाता है। नया समय चुनें — वही पास फिर चालू हो जाएगा और प्रॉपर्टी की तरफ़ वालों को बता दिया जाएगा।` : `A pass closes ${WINDOW_HOURS} hours after the visit time. Pick a new time — the same pass opens again and the property side is told.`)
        : (hi ? 'पास बंद हो गया है। बुक करने वाला ब्रोकर नया समय तय करेगा।' : 'The pass has closed. The broker who booked it sets a new time.'),
    };
    case 'LOCKED': return { title: hi ? 'विज़िट लॉक हो गई' : 'This visit is locked', body: hi ? `${MAX_TRIES} बार गलत कोड डाला गया। GENZ ऑपरेशंस से संपर्क करें।` : `${MAX_TRIES} wrong codes were typed. Contact GENZ Operations.` };
    default: return { title: '', body: '' };
  }
}
