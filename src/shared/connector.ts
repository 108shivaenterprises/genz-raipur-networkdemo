/**
 * GENZ Connector — local shopkeepers & community members (paan shop, chai stall, sabzi vendor, kirana …)
 * who refer people they know to GENZ and earn a reward when the referral closes.
 * Shared by the server and the client (no runtime dependencies).
 */
export const SHOP_TYPES = [
  { id: 'PAAN_SHOP', label: 'Paan shop', hi: 'पान की दुकान' },
  { id: 'TEA_STALL', label: 'Tea / chai stall', hi: 'चाय की गुमटी' },
  { id: 'VEGETABLE_VENDOR', label: 'Vegetable / fruit vendor', hi: 'सब्ज़ी / फल विक्रेता' },
  { id: 'KIRANA_STORE', label: 'Kirana / general store', hi: 'किराना दुकान' },
  { id: 'MEDICAL_STORE', label: 'Medical store', hi: 'मेडिकल स्टोर' },
  { id: 'SALON_BARBER', label: 'Salon / barber', hi: 'सैलून / नाई' },
  { id: 'STATIONERY_COPY', label: 'Stationery / photocopy / CSC', hi: 'स्टेशनरी / फोटोकॉपी / CSC' },
  { id: 'MOBILE_RECHARGE', label: 'Mobile / recharge shop', hi: 'मोबाइल / रिचार्ज दुकान' },
  { id: 'TIFFIN_DHABA', label: 'Tiffin / dhaba / small eatery', hi: 'टिफिन / ढाबा' },
  { id: 'AUTO_DRIVER', label: 'Auto / taxi / e-rickshaw driver', hi: 'ऑटो / टैक्सी चालक' },
  { id: 'SOCIETY_RWA', label: 'Society guard / RWA member', hi: 'सोसाइटी गार्ड / RWA' },
  { id: 'COMMUNITY_MEMBER', label: 'Community member / other local partner', hi: 'समुदाय सदस्य / अन्य' },
] as const;
export type ShopType = (typeof SHOP_TYPES)[number]['id'];
export const SHOP_TYPE_IDS = SHOP_TYPES.map(s => s.id) as [ShopType, ...ShopType[]];

export const REFERRAL_TYPES = [
  { id: 'BUY_PROPERTY', label: 'Wants to buy a property', hi: 'प्रॉपर्टी खरीदना चाहता है', defaultReward: 500 },
  { id: 'SELL_PROPERTY', label: 'Wants to sell a property', hi: 'प्रॉपर्टी बेचना चाहता है', defaultReward: 1000 },
  { id: 'RENT_TAKE', label: 'Needs a house / shop on rent', hi: 'किराए पर चाहिए', defaultReward: 300 },
  { id: 'RENT_GIVE', label: 'Wants to give property on rent', hi: 'किराए पर देना है', defaultReward: 300 },
  { id: 'LAND_PLOT', label: 'Plot / land (buy or sell)', hi: 'प्लॉट / ज़मीन', defaultReward: 1000 },
  { id: 'CONSTRUCTION', label: 'Construction / renovation work', hi: 'निर्माण / मरम्मत', defaultReward: 1000 },
  { id: 'LEGAL_DOCS', label: 'Registry / legal documents help', hi: 'रजिस्ट्री / कानूनी कागज़', defaultReward: 200 },
] as const;
export type ReferralType = (typeof REFERRAL_TYPES)[number]['id'];
export const REFERRAL_TYPE_IDS = REFERRAL_TYPES.map(s => s.id) as [ReferralType, ...ReferralType[]];

export const REFERRAL_STATUSES = [
  'SUBMITTED', 'CONTACTED', 'QUALIFIED', 'IN_PROGRESS', 'CLOSED_WON', 'CLOSED_LOST', 'DUPLICATE', 'REJECTED',
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export type RewardStatus = 'NONE' | 'APPROVED' | 'PAID' | 'CANCELLED';

export interface ReferralEvent {
  at: string;
  byId: string;
  byName: string;
  byRole: string;
  action: string;      // e.g. SUBMITTED, ASSIGNED, STATUS:CONTACTED, REWARD_APPROVED, REWARD_PAID
  note?: string;       // internal: never shown to the connector
}

/** v31: the connector's own share of the broker's commission on a closed deal. Agreed between the two; GENZ only records it. */
export type ShareStatus = 'PROPOSED' | 'AGREED' | 'DECLINED' | 'PAID' | 'CONFIRMED' | 'NOT_RECEIVED';
export type ShareSide = 'CONNECTOR' | 'WORKER';
export interface ShareStep { id: string; at: string; side: ShareSide | 'GENZ'; action: string; pct?: number; note?: string }
export interface ReferralShare {
  id: string;
  pct: number;                   // percent of the broker's commission
  proposedBy: ShareSide;
  status: ShareStatus;
  /** the broker's commission on the closed deal (₹), entered by the worker after CLOSED_WON */
  dealCommission?: number;
  amount?: number;               // round(dealCommission × pct / 100)
  paidNote?: string;
  history: ShareStep[];
  updatedAt: string;
}
export const DEFAULT_MAX_SHARE_PCT = 25;
export const shareAmount = (commission: number, pct: number) => Math.round((commission * pct) / 100);

export interface ConnectorReferral {
  id: string;                    // CR-2026-0001
  connectorId: string;
  connectorName: string;
  shopType: ShopType;
  type: ReferralType;
  customerName: string;
  customerPhone: string;         // '' while the connector keeps the customer's number private (CONNECTOR_INTRODUCES)
  /** SHARE_NUMBER: GENZ gets the customer's number. CONNECTOR_INTRODUCES: connector stays the contact and introduces the customer. */
  contactMode?: 'SHARE_NUMBER' | 'CONNECTOR_INTRODUCES';
  /** the connector's own number, shown only to the assigned worker, sponsor and GENZ ops, in introduce mode */
  connectorPhone?: string;
  customerConsent: boolean;      // the person agreed to be contacted by GENZ (DPDP)
  state?: string;
  city: string;
  locality: string;
  budgetNote?: string;           // free text, e.g. "around 40 lakh"
  details?: string;
  status: ReferralStatus;
  assignedToId?: string;
  assignedToName?: string;
  assignedToRole?: string;
  /** set when the partner belongs to a broker's own network: that broker works the referral and rewards the partner */
  sponsorId?: string;
  sponsorName?: string;
  rewardStatus: RewardStatus;
  rewardAmount?: number;
  rewardApprovedAt?: string;
  paidAt?: string;
  payoutReference?: string;
  /** v31: the connector's percentage of the broker's commission (paid outside GENZ) */
  share?: ReferralShare;
  duplicateHash: string;
  createdAt: string;
  updatedAt: string;
  events: ReferralEvent[];
}

export interface ConnectorProfile {
  shopType: ShopType;
  shopName: string;
  locality?: string;
  whatsapp?: string;
  payoutUpi?: string;
  /** the broker who recruited this partner into their own network (their referrals go to that broker) */
  sponsorId?: string;
}

export const DEFAULT_REWARDS: Record<string, number> = Object.fromEntries(REFERRAL_TYPES.map(t => [t.id, t.defaultReward]));
export const shopLabel = (id?: string, hi = false) => { const x = SHOP_TYPES.find(s => s.id === id); return x ? (hi ? x.hi : x.label) : id ?? ''; };
export const referralLabel = (id?: string, hi = false) => { const x = REFERRAL_TYPES.find(s => s.id === id); return x ? (hi ? x.hi : x.label) : id ?? ''; };

/** Allowed status moves. Admins may do all of them; assigned partners only the work-flow subset. */
export const STATUS_FLOW: Record<ReferralStatus, ReferralStatus[]> = {
  SUBMITTED: ['CONTACTED', 'REJECTED', 'DUPLICATE', 'CLOSED_LOST'],
  CONTACTED: ['QUALIFIED', 'CLOSED_LOST', 'REJECTED'],
  QUALIFIED: ['IN_PROGRESS', 'CLOSED_LOST'],
  IN_PROGRESS: ['CLOSED_WON', 'CLOSED_LOST'],
  CLOSED_WON: [],
  CLOSED_LOST: ['CONTACTED'],   // re-opened
  DUPLICATE: [],
  REJECTED: [],
};
