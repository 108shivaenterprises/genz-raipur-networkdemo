/**
 * Pan-India reference data shared by the server (validation, matching) and the web app (pickers).
 * Pure data + tiny helpers — no DOM, no Node APIs.
 *
 * Cities / localities are *suggestions*: every picker also accepts free text, because India has far more
 * places than any list can hold. States are the full set of 28 states + 8 union territories.
 */

export interface IndiaState {
  name: string;
  hi: string;
  /** Statutory RERA authority for the state / UT (name only — verify registrations on the authority's own portal). */
  rera: string;
  cities: string[];
}

export const INDIA_STATES: IndiaState[] = [
  { name: 'Andhra Pradesh', hi: 'आंध्र प्रदेश', rera: 'AP RERA', cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Amaravati', 'Tirupati', 'Nellore', 'Kurnool', 'Rajahmundry', 'Kakinada', 'Anantapur'] },
  { name: 'Arunachal Pradesh', hi: 'अरुणाचल प्रदेश', rera: 'Arunachal Pradesh RERA', cities: ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang'] },
  { name: 'Assam', hi: 'असम', rera: 'Assam RERA (ARERA)', cities: ['Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat', 'Nagaon', 'Tezpur'] },
  { name: 'Bihar', hi: 'बिहार', rera: 'Bihar RERA (BRERA)', cities: ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur', 'Darbhanga', 'Purnia', 'Arrah'] },
  { name: 'Chhattisgarh', hi: 'छत्तीसगढ़', rera: 'Chhattisgarh RERA (CG RERA)', cities: ['Raipur', 'Naya Raipur (Atal Nagar)', 'Bhilai', 'Durg', 'Bilaspur', 'Korba', 'Raigarh', 'Rajnandgaon', 'Jagdalpur', 'Ambikapur', 'Dhamtari'] },
  { name: 'Goa', hi: 'गोवा', rera: 'Goa RERA', cities: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda'] },
  { name: 'Gujarat', hi: 'गुजरात', rera: 'GujRERA', cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar', 'Bhavnagar', 'Jamnagar', 'Junagadh', 'Anand', 'Mehsana'] },
  { name: 'Haryana', hi: 'हरियाणा', rera: 'Haryana RERA (HRERA)', cities: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal', 'Hisar', 'Rohtak', 'Sonipat', 'Panchkula', 'Yamunanagar'] },
  { name: 'Himachal Pradesh', hi: 'हिमाचल प्रदेश', rera: 'HP RERA', cities: ['Shimla', 'Solan', 'Dharamshala', 'Mandi', 'Manali', 'Kullu', 'Baddi'] },
  { name: 'Jharkhand', hi: 'झारखंड', rera: 'Jharkhand RERA (JHARERA)', cities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro Steel City', 'Deoghar', 'Hazaribagh'] },
  { name: 'Karnataka', hi: 'कर्नाटक', rera: 'K-RERA', cities: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi-Dharwad', 'Belagavi', 'Kalaburagi', 'Ballari', 'Shivamogga', 'Tumakuru'] },
  { name: 'Kerala', hi: 'केरल', rera: 'K-RERA Kerala', cities: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Alappuzha', 'Palakkad'] },
  { name: 'Madhya Pradesh', hi: 'मध्य प्रदेश', rera: 'MP RERA', cities: ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Rewa', 'Satna', 'Ratlam', 'Dewas'] },
  { name: 'Maharashtra', hi: 'महाराष्ट्र', rera: 'MahaRERA', cities: ['Mumbai', 'Navi Mumbai', 'Thane', 'Pune', 'Pimpri-Chinchwad', 'Nagpur', 'Nashik', 'Aurangabad (Chhatrapati Sambhajinagar)', 'Kolhapur', 'Solapur', 'Vasai-Virar', 'Kalyan-Dombivli', 'Amravati'] },
  { name: 'Manipur', hi: 'मणिपुर', rera: 'Manipur RERA', cities: ['Imphal', 'Thoubal', 'Churachandpur'] },
  { name: 'Meghalaya', hi: 'मेघालय', rera: 'Meghalaya RERA', cities: ['Shillong', 'Tura', 'Jowai'] },
  { name: 'Mizoram', hi: 'मिजोरम', rera: 'Mizoram RERA', cities: ['Aizawl', 'Lunglei', 'Champhai'] },
  { name: 'Nagaland', hi: 'नागालैंड', rera: 'Nagaland RERA', cities: ['Kohima', 'Dimapur', 'Mokokchung'] },
  { name: 'Odisha', hi: 'ओडिशा', rera: 'Odisha RERA (ORERA)', cities: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri'] },
  { name: 'Punjab', hi: 'पंजाब', rera: 'Punjab RERA (PBRERA)', cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Mohali (SAS Nagar)', 'Bathinda', 'Pathankot'] },
  { name: 'Rajasthan', hi: 'राजस्थान', rera: 'Rajasthan RERA (RAJ RERA)', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Alwar', 'Bhilwara', 'Sikar'] },
  { name: 'Sikkim', hi: 'सिक्किम', rera: 'Sikkim RERA', cities: ['Gangtok', 'Namchi', 'Gyalshing'] },
  { name: 'Tamil Nadu', hi: 'तमिलनाडु', rera: 'TNRERA', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore', 'Hosur', 'Thanjavur'] },
  { name: 'Telangana', hi: 'तेलंगाना', rera: 'TS RERA (Telangana)', cities: ['Hyderabad', 'Secunderabad', 'Warangal', 'Karimnagar', 'Nizamabad', 'Khammam', 'Mahbubnagar'] },
  { name: 'Tripura', hi: 'त्रिपुरा', rera: 'Tripura RERA', cities: ['Agartala', 'Udaipur (Tripura)', 'Dharmanagar'] },
  { name: 'Uttar Pradesh', hi: 'उत्तर प्रदेश', rera: 'UP RERA', cities: ['Lucknow', 'Noida', 'Greater Noida', 'Ghaziabad', 'Kanpur', 'Agra', 'Varanasi', 'Prayagraj', 'Meerut', 'Bareilly', 'Gorakhpur', 'Mathura', 'Aligarh', 'Moradabad'] },
  { name: 'Uttarakhand', hi: 'उत्तराखंड', rera: 'Uttarakhand RERA (UKRERA)', cities: ['Dehradun', 'Haridwar', 'Haldwani', 'Rishikesh', 'Roorkee', 'Rudrapur', 'Nainital'] },
  { name: 'West Bengal', hi: 'पश्चिम बंगाल', rera: 'WBRERA', cities: ['Kolkata', 'Howrah', 'Siliguri', 'Durgapur', 'Asansol', 'New Town (Rajarhat)', 'Kharagpur', 'Bardhaman'] },
  // ── Union Territories ──
  { name: 'Andaman and Nicobar Islands', hi: 'अंडमान और निकोबार द्वीप समूह', rera: 'A&N RERA', cities: ['Port Blair'] },
  { name: 'Chandigarh', hi: 'चंडीगढ़', rera: 'Chandigarh RERA', cities: ['Chandigarh'] },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', hi: 'दादरा और नगर हवेली और दमन और दीव', rera: 'DNH&DD RERA', cities: ['Silvassa', 'Daman', 'Diu'] },
  { name: 'Delhi', hi: 'दिल्ली', rera: 'Delhi RERA', cities: ['New Delhi', 'South Delhi', 'North Delhi', 'East Delhi', 'West Delhi', 'Dwarka', 'Rohini', 'Najafgarh'] },
  { name: 'Jammu and Kashmir', hi: 'जम्मू और कश्मीर', rera: 'J&K RERA', cities: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Udhampur'] },
  { name: 'Ladakh', hi: 'लद्दाख', rera: 'Ladakh RERA', cities: ['Leh', 'Kargil'] },
  { name: 'Lakshadweep', hi: 'लक्षद्वीप', rera: 'Lakshadweep RERA', cities: ['Kavaratti'] },
  { name: 'Puducherry', hi: 'पुदुचेरी', rera: 'Puducherry RERA', cities: ['Puducherry', 'Karaikal', 'Yanam', 'Mahe'] },
];

/** Popular localities per city — suggestions only (any locality can be typed). */
export const CITY_LOCALITIES: Record<string, string[]> = {
  Raipur: ['Shankar Nagar', 'VIP Road', 'Telibandha', 'Devendra Nagar', 'Civil Lines', 'Pandri', 'Sadar Bazar', 'Pachpedi Naka', 'Tatibandh', 'Sarona', 'Kota', 'Samta Colony', 'Khamardih', 'Bhatagaon', 'Fafadih', 'Avanti Vihar', 'Ring Road No. 1', 'Marine Drive', 'Rajendra Nagar', 'Moudhapara', 'Kalibadi', 'Brahmapara', 'Purani Basti', 'Byron Bazar', 'Ravi Nagar', 'Tikrapara', 'Gudhiyari', 'Amanaka', 'Mowa', 'Dumartarai', 'Lalpur', 'Shanti Nagar', 'Kabir Nagar', 'Gaurav Path', 'Naya Raipur', 'Kachna', 'Labhandi', 'Boria Khurd', 'Ring Road No. 2', 'Ring Road No. 3'],
  'Naya Raipur (Atal Nagar)': ['Sector 15', 'Sector 21', 'Sector 24', 'Sector 27', 'Sector 29', 'Rakhi', 'Kharora'],
  Bhilai: ['Supela', 'Smriti Nagar', 'Nehru Nagar', 'Civic Centre', 'Sector 6', 'Risali', 'Kohka'],
  Bilaspur: ['Vyapar Vihar', 'Sarkanda', 'Tifra', 'Rajkishore Nagar', 'Link Road'],
  Mumbai: ['Andheri West', 'Andheri East', 'Bandra West', 'Powai', 'Worli', 'Lower Parel', 'Borivali', 'Goregaon', 'Malad', 'Kandivali', 'Chembur', 'Juhu', 'Colaba', 'Mulund'],
  'Navi Mumbai': ['Vashi', 'Nerul', 'Kharghar', 'Panvel', 'Airoli', 'Belapur', 'Ulwe'],
  Thane: ['Ghodbunder Road', 'Majiwada', 'Kolshet', 'Naupada', 'Vartak Nagar', 'Hiranandani Estate'],
  Pune: ['Kothrud', 'Baner', 'Hinjewadi', 'Wakad', 'Viman Nagar', 'Kharadi', 'Hadapsar', 'Aundh', 'Pimple Saudagar', 'Koregaon Park', 'Magarpatta', 'Wagholi'],
  Nagpur: ['Dharampeth', 'Manish Nagar', 'Wardha Road', 'Sadar', 'Besa', 'Pratap Nagar', 'Hingna'],
  'New Delhi': ['Connaught Place', 'Vasant Kunj', 'Saket', 'Greater Kailash', 'Defence Colony', 'Lajpat Nagar', 'Karol Bagh'],
  Dwarka: ['Sector 10', 'Sector 12', 'Sector 21', 'Sector 23'],
  Rohini: ['Sector 7', 'Sector 13', 'Sector 24'],
  Gurugram: ['DLF Phase 1–5', 'Golf Course Road', 'Sohna Road', 'Sector 49', 'Sector 57', 'Dwarka Expressway', 'MG Road', 'New Gurugram'],
  Noida: ['Sector 18', 'Sector 50', 'Sector 62', 'Sector 75', 'Sector 137', 'Sector 150', 'Noida Extension'],
  'Greater Noida': ['Pari Chowk', 'Alpha 1', 'Beta 2', 'Knowledge Park', 'Techzone 4'],
  Ghaziabad: ['Indirapuram', 'Vaishali', 'Raj Nagar Extension', 'Vasundhara', 'Crossings Republik'],
  Lucknow: ['Gomti Nagar', 'Hazratganj', 'Aliganj', 'Indira Nagar', 'Jankipuram', 'Alambagh', 'Sushant Golf City'],
  Bengaluru: ['Whitefield', 'Koramangala', 'Indiranagar', 'HSR Layout', 'Electronic City', 'Sarjapur Road', 'Hebbal', 'Yelahanka', 'JP Nagar', 'Jayanagar', 'Bellandur', 'Marathahalli', 'Devanahalli'],
  Hyderabad: ['Gachibowli', 'Madhapur', 'Kondapur', 'Banjara Hills', 'Jubilee Hills', 'Kukatpally', 'Miyapur', 'Financial District', 'Tellapur', 'Kokapet'],
  Chennai: ['Adyar', 'Anna Nagar', 'T. Nagar', 'OMR', 'Velachery', 'Porur', 'Tambaram', 'Guindy', 'Sholinganallur', 'ECR'],
  Kolkata: ['Salt Lake', 'New Town (Rajarhat)', 'Ballygunge', 'Alipore', 'Behala', 'Garia', 'Tollygunge', 'Park Street'],
  Ahmedabad: ['SG Highway', 'Satellite', 'Bopal', 'Prahlad Nagar', 'Navrangpura', 'Gota', 'Shela', 'Thaltej', 'Maninagar'],
  Surat: ['Adajan', 'Vesu', 'Pal', 'Althan', 'Piplod', 'Katargam'],
  Jaipur: ['Malviya Nagar', 'Vaishali Nagar', 'Mansarovar', 'C-Scheme', 'Jagatpura', 'Ajmer Road', 'Tonk Road', 'Sirsi Road'],
  Bhopal: ['Arera Colony', 'MP Nagar', 'Kolar Road', 'Bawadia Kalan', 'Hoshangabad Road', 'Shahpura', 'Ayodhya Bypass'],
  Indore: ['Vijay Nagar', 'Bhawarkua', 'Palasia', 'Super Corridor', 'AB Road', 'Rau', 'Scheme 78', 'Nipania'],
  Chandigarh: ['Sector 17', 'Sector 22', 'Sector 35', 'Sector 43', 'Manimajra'],
  Kochi: ['Kakkanad', 'Edappally', 'Marine Drive', 'Vyttila', 'Aluva'],
  Visakhapatnam: ['MVP Colony', 'Madhurawada', 'Rushikonda', 'Gajuwaka', 'Siripuram'],
  Patna: ['Kankarbagh', 'Boring Road', 'Rajendra Nagar', 'Patliputra Colony', 'Danapur'],
  Bhubaneswar: ['Patia', 'Saheed Nagar', 'Jaydev Vihar', 'Nayapalli', 'Khandagiri'],
  Dehradun: ['Rajpur Road', 'Sahastradhara Road', 'Ballupur', 'Race Course', 'Prem Nagar'],
  Ranchi: ['Kanke Road', 'Morabadi', 'Harmu', 'Bariatu', 'Lalpur'],
  Guwahati: ['Beltola', 'Dispur', 'Ganeshguri', 'Zoo Road', 'Six Mile'],
};

export interface TagGroup { group: string; groupHi: string; tags: string[] }

/** Curated listing / requirement tags. Users can also add their own (max 12 per record). */
export const TAG_GROUPS: TagGroup[] = [
  { group: 'Status', groupHi: 'स्थिति', tags: ['Ready to Move', 'Under Construction', 'New Launch', 'Resale', 'Pre-Leased', 'Distress Sale'] },
  { group: 'Features', groupHi: 'विशेषताएँ', tags: ['Corner Plot', 'East Facing', 'North Facing', 'Vastu Compliant', 'Main Road', 'Park Facing', 'Gated Community', 'Furnished', 'Semi-Furnished', 'Unfurnished'] },
  { group: 'Amenities', groupHi: 'सुविधाएँ', tags: ['Lift', 'Power Backup', 'Covered Parking', '24x7 Security', 'CCTV', 'Clubhouse', 'Gym', 'Swimming Pool', 'Garden / Park', 'Water 24x7', 'Solar', 'EV Charging'] },
  { group: 'Location', groupHi: 'स्थान', tags: ['Near Metro', 'Near Highway', 'Near Airport', 'Near Railway Station', 'Near School', 'Near Hospital', 'Near Market', 'Near IT Park', 'Near Industrial Area'] },
  { group: 'Legal & Finance', groupHi: 'कानूनी और वित्त', tags: ['RERA Registered', 'Clear Title', 'Registry Ready', 'Bank Loan Available', 'Freehold', 'Leasehold', 'Converted / NA Land', 'Approved Layout', 'Occupancy Certificate'] },
  { group: 'Land & Commercial', groupHi: 'भूमि और व्यावसायिक', tags: ['Farm Land', 'Industrial Zone', 'Highway Facing', 'Warehouse Grade', 'Mall / High Street', 'IT / SEZ'] },
];
export const ALL_TAGS: string[] = TAG_GROUPS.flatMap(g => g.tags);

export const PROPERTY_TYPES = [
  'Residential Flat',
  'Independent House',
  'Residential Villa',
  'Builder Floor',
  'Penthouse',
  'Residential Plot',
  'Commercial Plot',
  'Commercial Office',
  'Commercial Shop',
  'Showroom',
  'Warehouse / Godown',
  'Industrial Plot',
  'Agricultural Land',
  'Farm House',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Pairs that are close enough to earn partial credit in matching. */
export const RELATED_TYPE_GROUPS: string[][] = [
  ['Residential Flat', 'Builder Floor', 'Penthouse'],
  ['Independent House', 'Residential Villa', 'Farm House'],
  ['Residential Plot', 'Commercial Plot', 'Industrial Plot'],
  ['Commercial Office', 'Commercial Shop', 'Showroom'],
  ['Warehouse / Godown', 'Industrial Plot'],
  ['Agricultural Land', 'Farm House'],
];

const norm = (s?: string) => String(s ?? '').trim().toLowerCase();

export function findState(name?: string): IndiaState | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return INDIA_STATES.find(s => norm(s.name) === n || norm(s.hi) === n);
}
/** v80 — a geocoder / a phone / an IP table spell a state in many ways ("NCT of Delhi", "Orissa", "Jammu & Kashmir", "Chattisgarh"): find OUR state for it, or undefined */
const STATE_ALIAS: Record<string, string> = {
  'orissa': 'Odisha', 'uttaranchal': 'Uttarakhand', 'pondicherry': 'Puducherry', 'nct of delhi': 'Delhi', 'national capital territory of delhi': 'Delhi', 'new delhi': 'Delhi',
  'chattisgarh': 'Chhattisgarh', 'chhatisgarh': 'Chhattisgarh', 'chattishgarh': 'Chhattisgarh', 'jammu & kashmir': 'Jammu and Kashmir', 'andaman & nicobar islands': 'Andaman and Nicobar Islands', 'andaman and nicobar': 'Andaman and Nicobar Islands',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu', 'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu', 'dadra & nagar haveli and daman & diu': 'Dadra and Nagar Haveli and Daman and Diu', 'telengana': 'Telangana',
};
export function matchState(raw?: string): IndiaState | undefined {
  let n = norm(raw).replace(/\b(state|union territory|ut) of\b/g, '').replace(/\s+(state|ut)$/, '').replace(/\s+/g, ' ').trim();
  if (!n) return undefined;
  const direct = findState(n); if (direct) return direct;
  const al = STATE_ALIAS[n] || STATE_ALIAS[n.replace(/&/g, 'and')]; if (al) return findState(al);
  return INDIA_STATES.find(s => norm(s.name).replace(/&/g, 'and') === n.replace(/&/g, 'and'));
}
/** ISO 3166-2:IN code (what an edge network sends for the region: "CT" = Chhattisgarh) → our state */
const ISO_STATE: Record<string, string> = {
  AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CT: 'Chhattisgarh', CG: 'Chhattisgarh', GA: 'Goa', GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh', JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala',
  MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland', OR: 'Odisha', OD: 'Odisha', PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TG: 'Telangana', TS: 'Telangana',
  TR: 'Tripura', UP: 'Uttar Pradesh', UT: 'Uttarakhand', UK: 'Uttarakhand', WB: 'West Bengal', AN: 'Andaman and Nicobar Islands', CH: 'Chandigarh', DH: 'Dadra and Nagar Haveli and Daman and Diu', DN: 'Dadra and Nagar Haveli and Daman and Diu',
  DD: 'Dadra and Nagar Haveli and Daman and Diu', DL: 'Delhi', JK: 'Jammu and Kashmir', LA: 'Ladakh', LD: 'Lakshadweep', PY: 'Puducherry',
};
export const stateOfIso = (code?: string): IndiaState | undefined => findState(ISO_STATE[String(code || '').trim().toUpperCase()]);
export const stateNames = () => INDIA_STATES.map(s => s.name);
export function citiesOf(state?: string): string[] { return findState(state)?.cities ?? []; }
export function localitiesOf(city?: string): string[] { return CITY_LOCALITIES[city ?? ''] ?? []; }
export function reraAuthorityOf(state?: string): string { return findState(state)?.rera ?? 'the state RERA authority'; }
export function stateOfCity(city?: string): string | undefined {
  const c = norm(city);
  if (!c) return undefined;
  return INDIA_STATES.find(s => s.cities.some(x => norm(x) === c))?.name;
}

export const PINCODE_RE = /^[1-9]\d{5}$/;
export const isPincode = (p: unknown) => typeof p === 'string' && PINCODE_RE.test(p.trim());

export function sameCity(a?: string, b?: string) {
  const x = norm(a).replace(/\s*\(.*\)\s*/g, ''); const y = norm(b).replace(/\s*\(.*\)\s*/g, '');
  return !!x && x === y;
}

/** Clean + de-duplicate user supplied tags. */
export function cleanTags(input: unknown, max = 12): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const t of input) {
    const s = String(t ?? '').replace(/[<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (s.length >= 2 && !out.some(x => norm(x) === norm(s))) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
