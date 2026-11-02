/**
 * v107 — lead inlets: a secret address (a website form, or a webhook that Zapier / Make / a portal's e-mail parser can post to) through which an enquiry reaches
 * the owner's CRM as an ordinary, dedupe-protected lead. Pure rules: reading whatever field names the sender uses, cleaning the phone number, deciding consent.
 *
 * What this is NOT: GENZ has no native connection to 99acres, MagicBricks, Housing.com or Facebook / Instagram. Those platforms push leads only to their own
 * approved partners; an owner connects them here through a no-code bridge (Zapier / Make) or by forwarding the portal's enquiry e-mail. The screens say so.
 */
export type InletChannel = 'WEBSITE' | 'PORTAL' | 'META' | 'OTHER';
export type InletKind = 'FORM' | 'WEBHOOK';

export const INLET_LIMITS = { perOwner: 10, dailyCap: 300, logKeep: 40, labelMax: 60, detailMax: 100, noteMax: 1000, extraKeys: 8, extraValMax: 120, nameMax: 120 } as const;

/** what a channel means in the CRM: the lead source it is filed under, the default detail, and whether it has a public hosted form */
export const INLET_CHANNELS: { id: InletChannel; kind: InletKind; source: 'WEBSITE_ENQUIRY' | 'PROPERTY_PORTAL' | 'DIGITAL_CAMPAIGN' | 'OTHER'; en: string; hi: string; detail: string }[] = [
  { id: 'WEBSITE', kind: 'FORM', source: 'WEBSITE_ENQUIRY', en: 'My website / a form link', hi: 'मेरी वेबसाइट / फ़ॉर्म लिंक', detail: 'Website form' },
  { id: 'PORTAL', kind: 'WEBHOOK', source: 'PROPERTY_PORTAL', en: 'Property portal (99acres, MagicBricks, Housing…)', hi: 'प्रॉपर्टी पोर्टल (99acres, MagicBricks, Housing…)', detail: '' },
  { id: 'META', kind: 'WEBHOOK', source: 'DIGITAL_CAMPAIGN', en: 'Facebook / Instagram lead ads', hi: 'फ़ेसबुक / इंस्टाग्राम लीड ऐड', detail: 'Meta Lead Ads' },
  { id: 'OTHER', kind: 'WEBHOOK', source: 'OTHER', en: 'Something else (any tool that can post)', hi: 'कुछ और (जो भी टूल पोस्ट कर सके)', detail: '' },
];
export const channelOf = (id: string) => INLET_CHANNELS.find(c => c.id === id);

const plain = (v: unknown, max: number): string => {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v !== 'string') return '';
  // text only: no control characters, no angle brackets (the app escapes on display too — this is the second lock)
  return v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
};
const key = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES: Record<string, string[]> = {
  name: ['name', 'fullname', 'customername', 'leadname', 'clientname', 'contactname', 'yourname'],
  first: ['firstname', 'fname', 'givenname'],
  last: ['lastname', 'lname', 'surname', 'familyname'],
  phone: ['phone', 'mobile', 'phonenumber', 'mobilenumber', 'contact', 'contactnumber', 'whatsapp', 'whatsappnumber', 'cell', 'tel', 'telephone', 'mobileno', 'phoneno', 'customerphone'],
  email: ['email', 'emailaddress', 'mail', 'emailid', 'customeremail'],
  message: ['message', 'note', 'notes', 'comment', 'comments', 'query', 'requirement', 'requirements', 'enquiry', 'inquiry', 'remarks', 'description'],
  budget: ['budget', 'budgetmax', 'maxbudget', 'pricerange'],
  unit: ['bhk', 'config', 'configuration', 'unittype', 'interest', 'unitinterest', 'propertytype', 'typology'],
  detail: ['sourcedetail', 'portal', 'portalname', 'campaign', 'campaignname', 'utmsource', 'utmcampaign', 'formname', 'platform'],
  consent: ['consent', 'agree', 'agreed', 'terms', 'optin', 'acceptterms', 'iagree', 'permission'],
};
const NOT_EXTRA = new Set(Object.values(ALIASES).flat().concat(['hpurl', 'companywebsite', 'token', 't', 'submit', 'next', 'redirect']));

export const cleanPhone = (raw: unknown): string => {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  else if (d.length === 13 && d.startsWith('091')) d = d.slice(3);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
};

/** true / false when the sender said so clearly; undefined when he said nothing (the owner's own attestation at set-up then stands) */
export const parseConsent = (v: unknown): boolean | undefined => {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const s = String(v ?? '').trim().toLowerCase();
  if (['true', 'yes', 'y', 'on', '1', 'agree', 'agreed', 'accept', 'accepted', 'checked'].includes(s)) return true;
  if (['false', 'no', 'n', 'off', '0', 'disagree', 'declined', 'unchecked'].includes(s)) return false;
  return undefined;
};

export interface InletFields {
  name: string; phone: string; email: string; message: string; budget?: number; /** a budget the sender wrote in words or in lakhs ("40 lakh", 45) — kept in the note, never guessed into a number */ budgetText: string;
  unitInterest: string; detail: string; consent?: boolean; extras: [string, string][];
}

/** read an enquiry whatever the sender called its fields (Zapier: full_name / phone_number …; a plain form: name / mobile …) */
export function pickFields(raw: unknown): InletFields {
  const o: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const byKey = new Map<string, [string, unknown]>();
  for (const [k, v] of Object.entries(o).slice(0, 60)) if (!byKey.has(key(k))) byKey.set(key(k), [k, v]);
  const first = (names: string[], max: number): string => { for (const n of names) { const e = byKey.get(n); if (e) { const s = plain(e[1], max); if (s) return s; } } return ''; };
  let name = first(ALIASES.name, INLET_LIMITS.nameMax);
  if (!name) name = [first(ALIASES.first, 60), first(ALIASES.last, 60)].filter(Boolean).join(' ');
  const phoneRaw = first(ALIASES.phone, 40);
  const budgetRaw = first(ALIASES.budget, 40).replace(/,/g, '');
  const bn = /^\d+(\.\d+)?$/.test(budgetRaw) ? Number(budgetRaw) : NaN;
  // a plain number counts as rupees only when it is clearly rupees (≥ ₹1 lakh); "45" could be 45 lakh, so it stays words
  const rupees = Number.isFinite(bn) && bn >= 100_000 && bn <= 100_000_000_000;
  const consentKey = ALIASES.consent.find(n => byKey.has(n));
  const extras: [string, string][] = [];
  for (const [kk, [orig, v]] of byKey) {
    if (NOT_EXTRA.has(kk) || extras.length >= INLET_LIMITS.extraKeys) continue;
    const s = plain(v, INLET_LIMITS.extraValMax); if (s) extras.push([plain(orig, 40), s]);
  }
  return {
    name, phone: phoneRaw, email: first(ALIASES.email, 200), message: first(ALIASES.message, 600), unitInterest: first(ALIASES.unit, 160), detail: first(ALIASES.detail, INLET_LIMITS.detailMax),
    budgetText: rupees ? '' : budgetRaw.slice(0, 40), ...(rupees ? { budget: bn } : {}),
    ...(consentKey ? { consent: parseConsent(byKey.get(consentKey)![1]) } : {}), extras,
  };
}

/** the line written on the lead: where it came from, what the customer wrote, and any other answers on the form (e.g. a Meta lead-ad question) */
export function inletNote(label: string, f: InletFields): string {
  const parts = [`Via “${label}”`];
  if (f.message) parts.push(f.message);
  const more = f.extras.map(([k, v]) => `${k}: ${v}`);
  if (f.budgetText) more.push(`budget: ${f.budgetText}`);
  if (more.length) parts.push(`Form answers — ${more.join(' · ')}`);
  return parts.join('. ').slice(0, INLET_LIMITS.noteMax);
}

export type InletOutcome = 'CREATED' | 'DUPLICATE' | 'REJECTED' | 'LIMIT';
export const outcomeLabel = (o: InletOutcome, hi = false) => ({
  CREATED: hi ? 'नई लीड' : 'New lead', DUPLICATE: hi ? 'पहले से है' : 'Already registered', REJECTED: hi ? 'नहीं ली गई' : 'Not taken', LIMIT: hi ? 'रोज़ की सीमा' : 'Daily limit',
}[o]);

/** a ready-to-paste form for the owner's own website */
export function formSnippet(url: string, label: string): string {
  const e = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return `<form action="${e(url)}" method="post">
  <input name="name" placeholder="Your name" required>
  <input name="phone" placeholder="Mobile number" inputmode="numeric" required>
  <input name="message" placeholder="What are you looking for? (optional)">
  <label><input type="checkbox" name="consent" value="yes" required> I agree to be contacted about ${e(label)}</label>
  <input name="hp_url" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Send</button>
</form>`;
}
