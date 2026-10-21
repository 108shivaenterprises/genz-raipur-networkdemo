import { useI18n } from './i18n.js';

/**
 * Hindi names for the fixed values (enums) the server stores in English — property type, buyer purpose, urgency, etc.
 * The stored value never changes; only what is shown does. Unknown values fall back to the stored text.
 */
const HI = {
  propertyType: {
    'Residential Flat': 'रिहायशी फ़्लैट', 'Independent House': 'इंडिपेंडेंट हाउस', 'Residential Villa': 'रिहायशी विला', 'Builder Floor': 'बिल्डर फ़्लोर',
    'Penthouse': 'पेंटहाउस', 'Residential Plot': 'रिहायशी प्लॉट', 'Commercial Plot': 'कमर्शियल प्लॉट', 'Commercial Office': 'कमर्शियल ऑफ़िस',
    'Commercial Shop': 'कमर्शियल दुकान', 'Showroom': 'शोरूम', 'Warehouse / Godown': 'वेयरहाउस / गोदाम', 'Industrial Plot': 'औद्योगिक प्लॉट',
    'Agricultural Land': 'खेती की ज़मीन', 'Farm House': 'फ़ार्म हाउस',
  },
  transactionType: { Sale: 'बिक्री', Rent: 'किराया', Lease: 'लीज़' },
  purpose: { 'Self-use': 'अपने उपयोग के लिए', Investment: 'निवेश', 'Rental Yield': 'किराये की कमाई', 'Commercial Relocation': 'व्यावसायिक स्थानांतरण' },
  urgency: { 'Immediate (< 15 days)': 'तुरंत (15 दिन से कम)', 'Moderate (1-3 months)': 'मध्यम (1-3 महीने)', 'Exploratory (3-6 months)': 'देख रहे हैं (3-6 महीने)' },
  requirementStatus: { active: 'सक्रिय', matching: 'मैचिंग जारी', in_deal_room: 'डील रूम में', fulfilled: 'पूरी हुई', closed: 'बंद' },
  leadStatus: { OPEN: 'खुली', ASSIGNED: 'सौंपी गई', IN_PROGRESS: 'काम चालू', COMPLETED: 'पूरी', CANCELLED: 'रद्द' },
  constructionType: {
    'Turnkey Residential': 'टर्नकी रिहायशी', 'Commercial Interior Fitout': 'कमर्शियल इंटीरियर फ़िटआउट', 'Renovation & Remodel': 'रेनोवेशन और रीमॉडल',
    'Structural Expansion': 'स्ट्रक्चरल विस्तार', 'Architectural Sanction': 'आर्किटेक्चरल मंज़ूरी',
  },
  disputeStatus: { OPEN: 'खुली', UNDER_REVIEW: 'जाँच में', MEDIATION: 'मध्यस्थता', RESOLVED: 'सुलझी', DISMISSED: 'खारिज' },
  disputeReason: {
    BYPASS_ATTEMPT: 'एंटी-बायपास उल्लंघन', COMMISSION_NON_PAYMENT: 'कमीशन न चुकाना', FALSE_REPRESENTATION: 'झूठा विवरण देना', UNAUTHORIZED_CONTACT: 'बिना अनुमति संपर्क', OTHER: 'अन्य',
  },
  tag: {
    'Ready to Move': 'तुरंत कब्ज़ा',
    'Under Construction': 'निर्माणाधीन',
    'New Launch': 'नया लॉन्च',
    'Resale': 'रीसेल',
    'Pre-Leased': 'पहले से किराये पर',
    'Distress Sale': 'जल्दी बिक्री',
    'Corner Plot': 'कॉर्नर प्लॉट',
    'East Facing': 'पूर्वमुखी',
    'North Facing': 'उत्तरमुखी',
    'Vastu Compliant': 'वास्तु अनुकूल',
    'Main Road': 'मेन रोड',
    'Park Facing': 'पार्क के सामने',
    'Gated Community': 'गेटेड कॉलोनी',
    'Furnished': 'फ़र्निश्ड',
    'Semi-Furnished': 'सेमी-फ़र्निश्ड',
    'Unfurnished': 'बिना फ़र्नीचर',
    'Lift': 'लिफ़्ट',
    'Power Backup': 'पावर बैकअप',
    'Covered Parking': 'ढकी पार्किंग',
    '24x7 Security': '24x7 सुरक्षा',
    'CCTV': 'CCTV',
    'Clubhouse': 'क्लबहाउस',
    'Gym': 'जिम',
    'Swimming Pool': 'स्विमिंग पूल',
    'Garden / Park': 'बगीचा / पार्क',
    'Water 24x7': '24x7 पानी',
    'Solar': 'सोलर',
    'EV Charging': 'EV चार्जिंग',
    'Near Metro': 'मेट्रो के पास',
    'Near Highway': 'हाईवे के पास',
    'Near Airport': 'एयरपोर्ट के पास',
    'Near Railway Station': 'रेलवे स्टेशन के पास',
    'Near School': 'स्कूल के पास',
    'Near Hospital': 'अस्पताल के पास',
    'Near Market': 'बाज़ार के पास',
    'Near IT Park': 'IT पार्क के पास',
    'Near Industrial Area': 'औद्योगिक क्षेत्र के पास',
    'RERA Registered': 'RERA पंजीकृत',
    'Clear Title': 'साफ़ टाइटल',
    'Registry Ready': 'रजिस्ट्री के लिए तैयार',
    'Bank Loan Available': 'बैंक लोन उपलब्ध',
    'Freehold': 'फ़्रीहोल्ड',
    'Leasehold': 'लीज़होल्ड',
    'Converted / NA Land': 'डायवर्टेड / NA ज़मीन',
    'Approved Layout': 'मंज़ूर लेआउट',
    'Occupancy Certificate': 'ऑक्यूपेंसी सर्टिफ़िकेट',
    'Farm Land': 'खेती की ज़मीन',
    'Industrial Zone': 'औद्योगिक ज़ोन',
    'Highway Facing': 'हाईवे फ़ेसिंग',
    'Warehouse Grade': 'वेयरहाउस ग्रेड',
    'Mall / High Street': 'मॉल / हाई स्ट्रीट',
    'IT / SEZ': 'IT / SEZ',
  },
  role: {
    SUPERADMIN: 'सुपर एडमिन', ADMIN: 'एडमिन', BROKER: 'ब्रोकर', PROPERTY_OWNER: 'प्रॉपर्टी मालिक', BUYER_TENANT: 'खरीदार / किरायेदार', CONTRACTOR: 'ठेकेदार',
    DEVELOPER_BUILDER: 'डेवलपर / बिल्डर', LEGAL_COUNSEL: 'क़ानूनी सलाहकार', GENZ_CONNECTOR: 'GENZ कनेक्टर', TEAM_MEMBER: 'टीम सदस्य',
  },
  /** Generic status / kind chips that the server sends as SHOUTING_ENUMS (tie-ups, mandates, offers, invitations, desk requests, privacy requests …). */
  status: {
    ACTIVE: 'चालू', PENDING: 'बाकी', PROPOSED: 'प्रस्तावित', ACCEPTED: 'स्वीकृत', REJECTED: 'अस्वीकृत', DECLINED: 'अस्वीकृत', WITHDRAWN: 'वापस लिया', EXPIRED: 'समय समाप्त',
    ENDED: 'समाप्त', REVOKED: 'रद्द', PAUSED: 'रुका हुआ', CLOSED: 'बंद', CANCELLED: 'रद्द', COMPLETED: 'पूरा', DONE: 'हो गया', OPEN: 'खुला', ACK: 'देख लिया',
    RESOLVED: 'सुलझा', UNDER_REVIEW: 'जाँच में', IN_PROGRESS: 'काम चालू', NOT_STARTED: 'शुरू नहीं', NEW: 'नया', SUBMITTED: 'जमा हुआ', COUNTERED: 'काउंटर', TOKEN_HELD: 'टोकन होल्ड',
    BACKUP: 'बैकअप', RELEASED: 'रिलीज़', REQUESTED: 'अनुरोध किया', APPROVED: 'मंज़ूर', CONFIRMED: 'पक्का', RECORDED: 'दर्ज', AVAILABLE: 'उपलब्ध', PLANNED: 'योजना में',
    INVITED: 'इनवाइट भेजा', JOINED: 'जुड़ गया', REDEEMED: 'इस्तेमाल हुआ', APPLIED: 'आवेदन किया', SHORTLISTED: 'शॉर्टलिस्ट', PENDING_BROKER: 'ब्रोकर का इंतज़ार',
    ACTIVE_ASSOCIATE: 'सक्रिय एसोसिएट', ACTIVE_LAUNCH: 'लॉन्च चालू', TOP_PERFORMER: 'टॉप परफ़ॉर्मर', PRE_BOOKING: 'प्री-बुकिंग',
    CRITICAL: 'गंभीर', HIGH: 'ऊँचा', MEDIUM: 'मध्यम', LOW: 'कम', INFORMATIONAL: 'सूचना', REOPENED: 'दोबारा खुला',
    VERIFIED: 'वेरिफ़ाइड', SUSPENDED: 'सस्पेंड', BLACKLISTED: 'ब्लैकलिस्ट',
    SITE_VISIT_COORD: 'साइट विज़िट कोऑर्डिनेशन', PAPERWORK: 'कागज़ी काम', LAUNCH_DAY: 'लॉन्च डे', OTHER: 'अन्य',
    ACCESS: 'डेटा की कॉपी', CORRECTION: 'सुधार', ERASURE: 'डेटा हटाना', GRIEVANCE: 'शिकायत',
    BROKER_BROKER: 'ब्रोकर–ब्रोकर', BUILDER_BROKER: 'बिल्डर–ब्रोकर',
    CALL: 'कॉल', WHATSAPP: 'WhatsApp', MEETING: 'मीटिंग', SITE_VISIT: 'साइट विज़िट', NOTE: 'नोट', EMAIL: 'ईमेल', SMS: 'SMS',
  },
  builderProjectType: { 'Luxury High-Rise': 'लग्ज़री हाई-राइज़', 'Gated Plotted Enclave': 'गेटेड प्लॉटेड एन्क्लेव', 'Commercial Mall & Business Hub': 'कमर्शियल मॉल और बिज़नेस हब', 'Ultra-Luxury Villas': 'अल्ट्रा-लग्ज़री विला' },
  builderProjectStage: { 'Pre-Launch / Upcoming': 'प्री-लॉन्च / आने वाला', 'Under Construction': 'निर्माणाधीन', 'Ready to Move': 'तैयार (कब्ज़े के लिए)' },
  dealStage: { Lead: 'लीड', Introduction: 'परिचय', 'Site Visit Done': 'साइट विज़िट पूरी', Negotiation: 'बातचीत', Agreement: 'समझौता', Handover: 'हैंडओवर', Settled: 'निपटा', Disputed: 'विवाद में' },
  referralStatus: { SUBMITTED: 'जमा हुआ', CONTACTED: 'संपर्क हुआ', QUALIFIED: 'योग्य', IN_PROGRESS: 'काम चालू', CLOSED_WON: 'जीता', CLOSED_LOST: 'खोया', DUPLICATE: 'डुप्लिकेट', REJECTED: 'अस्वीकृत' },
  verification: { VERIFIED: 'वेरिफ़ाइड', PENDING: 'बाकी', REJECTED: 'अस्वीकृत', BLACKLISTED: 'ब्लैकलिस्ट' },
  activityType: { CALL: 'कॉल', WHATSAPP: 'WhatsApp', MEETING: 'मीटिंग', SITE_VISIT: 'साइट विज़िट', NOTE: 'नोट', EMAIL: 'ईमेल', SMS: 'SMS', STAGE_CHANGE: 'स्टेज बदलाव', SYSTEM: 'सिस्टम' },
  listingStatus: {
    draft: 'ड्राफ़्ट', pending_verification: 'वेरिफ़िकेशन बाकी', active: 'सक्रिय', under_negotiation: 'बातचीत जारी', sold: 'बिक गई', rented: 'किराये पर गई', withdrawn: 'हटाई गई', suspended: 'निलंबित',
  },
} as const;

export type LabelKind = keyof typeof HI;

/** `const label = useLabel(); label('propertyType', p.propertyType)` → Hindi when the app is in Hindi, else the stored value. */
export function useLabel() {
  const { lang } = useI18n();
  return (kind: LabelKind, value: string | undefined | null): string => {
    const v = value ?? '';
    if ((kind === 'role' || kind === 'status') && lang !== 'hi') return v.replace(/_/g, ' ');
    if (kind === 'activityType' && lang !== 'hi') return ({ STAGE_CHANGE: 'Stage change', SYSTEM: 'System' } as Record<string, string>)[v] ?? v;
    return lang === 'hi' ? ((HI[kind] as Record<string, string>)[v] ?? v) : v;
  };
}

/** The matching engine writes its "why this matched" lines in English; these patterns give the Hindi reading of each. */
const REASONS_HI: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Exact transaction match: (.+)$/, m => `लेन-देन का प्रकार मेल खाता है: ${(HI.transactionType as Record<string, string>)[m[1]] ?? m[1]}`],
  [/^Mismatched transaction type \((.+) vs (.+)\)$/, m => `लेन-देन का प्रकार अलग है (${(HI.transactionType as Record<string, string>)[m[1]] ?? m[1]} बनाम ${(HI.transactionType as Record<string, string>)[m[2]] ?? m[2]})`],
  [/^Exact property category match: (.+)$/, m => `प्रॉपर्टी का प्रकार बिल्कुल मेल खाता है: ${(HI.propertyType as Record<string, string>)[m[1]] ?? m[1]}`],
  [/^Related category match \((.+) ~ (.+)\)$/, m => `मिलता-जुलता प्रकार (${(HI.propertyType as Record<string, string>)[m[1]] ?? m[1]} ~ ${(HI.propertyType as Record<string, string>)[m[2]] ?? m[2]})`],
  [/^Different property classification$/, () => 'प्रॉपर्टी का प्रकार अलग है'],
  [/^Prime location alignment in (.+)$/, m => `पसंदीदा इलाके में: ${m[1]}`],
  [/^Different city \((.+) vs requested (.+)\)$/, m => `शहर अलग है (${m[1]}, माँगा गया ${m[2]})`],
  [/^City match: (.+) \(outside the preferred localities\)$/, m => `शहर मेल खाता है: ${m[1]} (पसंदीदा इलाकों से बाहर)`],
  [/^Asking price (₹[\d.]+L) sits inside target budget \((₹[\d.]+L) - (₹[\d.]+L)\)$/, m => `माँगी गई कीमत ${m[1]} बजट (${m[2]} - ${m[3]}) के अंदर है`],
  [/^High value: Asking price (₹[\d.]+L) is below maximum budget cap$/, m => `ऊँची कीमत: ${m[1]} अधिकतम बजट से नीचे है`],
  [/^Within 10% negotiation margin of buyer's upper budget$/, () => 'खरीदार के ऊपरी बजट से 10% बातचीत की गुंजाइश में'],
  [/^Above target budget range$/, () => 'बजट सीमा से ऊपर'],
  [/^Built-up space \((.+) sq\.ft\) satisfies floor space criteria$/, m => `बिल्ट-अप जगह (${m[1]} वर्ग फ़ुट) माँग पूरी करती है`],
  [/^Area \((.+) sq\.ft\) close to requested specifications$/, m => `क्षेत्रफल (${m[1]} वर्ग फ़ुट) माँग के करीब है`],
  [/^Area \((.+) sq\.ft\) deviates from requested bounds$/, m => `क्षेत्रफल (${m[1]} वर्ग फ़ुट) माँगी सीमा से हटकर है`],
  [/^Matches (\d+)\/(\d+) requested tags$/, m => `माँगे गए ${m[2]} टैग में से ${m[1]} मेल खाते हैं`],
  [/^Verified property documents & RERA compliance checked$/, () => 'प्रॉपर्टी दस्तावेज़ और RERA अनुपालन जाँचे गए'],
];

export function useReason() {
  const { lang } = useI18n();
  return (text: string): string => {
    if (lang !== 'hi') return text;
    for (const [re, f] of REASONS_HI) { const m = text.match(re); if (m) return f(m); }
    return text;
  };
}
