/**
 * v13 — pure rules for builder-project visit QR passes (shared by server, browser and tests).
 */
export const PASS_PREFIX = 'GENZV:';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const PASS_BEFORE_H = 2;   // pass opens 2 h before the slot
export const PASS_AFTER_H = 10;   // and stays valid 10 h after it
export const MAX_AHEAD_DAYS = 30;
export const MAX_PARTY = 10;

export function makeCode(rand: (n: number) => number): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[rand(ALPHABET.length)];
  return s;
}

/** Accepts "GENZV:ABC…", a pasted /v/ link, or a bare code (spaces/dashes ignored). Returns '' if it cannot be a pass code. */
export function normalizeCode(input: string): string {
  let s = String(input || '').trim();
  const m = s.match(/\/v\/([A-Za-z0-9]{10})/);
  if (m) s = m[1];
  s = s.replace(/^GENZV:/i, '').replace(/[\s-]/g, '').toUpperCase();
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(s) ? s : '';
}

export const qrPayload = (code: string) => PASS_PREFIX + code;

export function passWindow(scheduledAtIso: string) {
  const t = Date.parse(scheduledAtIso);
  return { validFrom: new Date(t - PASS_BEFORE_H * 3600_000).toISOString(), validUntil: new Date(t + PASS_AFTER_H * 3600_000).toISOString() };
}

/** Can a pass be booked for this slot? Returns an error string or ''. */
export function checkSlot(scheduledAtIso: string, now = Date.now()): string {
  const t = Date.parse(scheduledAtIso);
  if (Number.isNaN(t)) return 'Pick a valid visit date and time';
  if (t < now - PASS_BEFORE_H * 3600_000) return 'Visit time is in the past';
  if (t > now + MAX_AHEAD_DAYS * 86400_000) return `Visit can be booked at most ${MAX_AHEAD_DAYS} days ahead`;
  return '';
}

export type PassState = 'NOT_YET' | 'OPEN' | 'EXPIRED';
export function passTiming(p: { validFrom: string; validUntil: string }, now = Date.now()): PassState {
  if (now < Date.parse(p.validFrom)) return 'NOT_YET';
  if (now > Date.parse(p.validUntil)) return 'EXPIRED';
  return 'OPEN';
}

/** Visitor name is shown on the pass and must be checked against ID by the scanner. Public page shows first name only. */
export const firstName = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';

export const STAGES_BEFORE_VISIT = ['NEW', 'CONTACTED', 'SITE_VISIT_SCHEDULED'];
export const STAGES_NO_PASS = ['LOST', 'BOOKED', 'BOOKING_REQUESTED'];

/** Bilingual role matrix shown in the app and docs. */
export const VISIT_RULES = [
  { who: { en: 'Channel partner (broker)', hi: 'चैनल पार्टनर (ब्रोकर)' }, create: true, scan: false,
    en: 'Creates passes for own leads only. Cannot scan — so a partner can never "verify" their own visit.',
    hi: 'सिर्फ़ अपने लीड के पास बनाता है। स्कैन नहीं कर सकता — अपनी विज़िट खुद वेरिफ़ाई नहीं कर सकता।' },
  { who: { en: "Partner's staff", hi: 'पार्टनर का स्टाफ' }, create: true, scan: false,
    en: 'Creates passes only for leads allotted to them. Cannot scan.',
    hi: 'सिर्फ़ अपने को दिए गए लीड के पास बना सकता है। स्कैन नहीं।' },
  { who: { en: 'Builder (owner)', hi: 'बिल्डर (मालिक)' }, create: true, scan: true,
    en: 'Scans passes of own projects. Creates passes only for builder-desk leads — NOT for a partner\'s lead (maker ≠ checker).',
    hi: 'अपने प्रोजेक्ट के पास स्कैन करता है। पास सिर्फ़ बिल्डर-डेस्क लीड के लिए बना सकता है — पार्टनर के लीड के लिए नहीं (बनाने वाला ≠ जाँचने वाला)।' },
  { who: { en: "Builder's site staff", hi: 'बिल्डर का साइट स्टाफ' }, create: false, scan: true,
    en: 'Scans only if the builder switched on "Can scan visit QR" for them, for their allotted projects, and not while on leave.',
    hi: 'सिर्फ़ तब स्कैन करता है जब बिल्डर ने "विज़िट QR स्कैन" चालू किया हो — अपने प्रोजेक्ट पर, छुट्टी पर नहीं।' },
  { who: { en: 'Customer (visitor)', hi: 'ग्राहक (विज़िटर)' }, create: false, scan: false,
    en: 'Only shows the pass (link / QR) at the gate with a photo ID. Needs no login.',
    hi: 'सिर्फ़ गेट पर पास (लिंक / QR) और फ़ोटो ID दिखाता है। लॉगिन नहीं चाहिए।' },
  { who: { en: 'Admin', hi: 'एडमिन' }, create: false, scan: false,
    en: 'Can audit passes and scans but cannot create or scan — neutral platform.',
    hi: 'पास और स्कैन का ऑडिट देख सकता है, बना/स्कैन नहीं सकता — न्यूट्रल प्लेटफ़ॉर्म।' },
];

/** Project rule QR_REQUIRED: leads created after the rule was switched on need a scanned pass before SITE_VISITED / NEGOTIATION / booking. */
export function needsVisitProof(project: { visitProof?: string; visitProofSince?: string } | undefined,
  lead: { createdAt: string; visitProof?: unknown }): boolean {
  if (!project || project.visitProof !== 'QR_REQUIRED' || lead.visitProof) return false;
  return !project.visitProofSince || Date.parse(lead.createdAt) >= Date.parse(project.visitProofSince);
}

/** v34 — where the visit QR is scanned (chosen when the QR is made) and who scans it. */
export type ScanKind = 'PASS' | 'VISIT';
export const SCAN_POINTS: Record<ScanKind, { id: string; en: string; hi: string }[]> = {
  PASS: [
    { id: 'OFFICE', en: 'Project / sales office', hi: 'प्रोजेक्ट / सेल्स ऑफ़िस' },
    { id: 'GATE', en: 'Site gate', hi: 'साइट गेट' },
    { id: 'MODEL', en: 'Model flat / sample house', hi: 'मॉडल फ़्लैट / सैंपल हाउस' },
  ],
  VISIT: [
    { id: 'PROPERTY', en: 'At the property', hi: 'प्रॉपर्टी पर' },
    { id: 'MEET', en: 'At the meeting point near the property', hi: 'प्रॉपर्टी के पास मिलने की जगह पर' },
  ],
};
export const SCAN_WHO: Record<ScanKind, { en: string; hi: string }> = {
  PASS: { en: 'the builder’s team scans it', hi: 'बिल्डर की टीम स्कैन करेगी' },
  VISIT: { en: 'the owner or the listing broker scans it', hi: 'मालिक या लिस्टिंग ब्रोकर स्कैन करेगा' },
};
export const scanPointIds = (k: ScanKind) => SCAN_POINTS[k].map(x => x.id);
export const defaultScanPoint = (k: ScanKind) => SCAN_POINTS[k][0].id;
export function scanLine(k: ScanKind, id?: string): { where: { en: string; hi: string }; who: { en: string; hi: string } } {
  const p = SCAN_POINTS[k].find(x => x.id === id) || SCAN_POINTS[k][0];
  return { where: { en: p.en, hi: p.hi }, who: SCAN_WHO[k] };
}
