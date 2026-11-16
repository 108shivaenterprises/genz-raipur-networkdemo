/** v156 — the "Paper check" of a deal: a plain tick / untick list the deal brokers keep for themselves. GENZ does not check or certify any paper. */
export const PAPER_ITEMS: { key: string; en: string; hi: string }[] = [
  { key: 'owner_id', en: 'Owner ID and photo seen', hi: 'मालिक का ID और फ़ोटो देखा' },
  { key: 'sale_deed', en: 'Registered sale deed / title paper', hi: 'रजिस्टर्ड रजिस्ट्री / मालिकाना काग़ज़' },
  { key: 'khasra', en: 'Khasra, B1 / Khatauni', hi: 'खसरा, बी-1 / खतौनी' },
  { key: 'tax', en: 'Latest tax receipts', hi: 'ताज़ा टैक्स रसीदें' },
  { key: 'approvals', en: 'Map / approval / NOC', hi: 'नक्शा / मंज़ूरी / NOC' },
  { key: 'diversion', en: 'Land diversion (if farm land)', hi: 'डायवर्जन (खेती की ज़मीन हो तो)' },
  { key: 'loan', en: 'No loan or mortgage on it', hi: 'कोई लोन या गिरवी नहीं' },
  { key: 'possession', en: 'Possession / vacant seen at site', hi: 'क़ब्ज़ा / ख़ाली साइट पर देखा' },
];
export const PAPER_KEYS = PAPER_ITEMS.map(i => i.key);
