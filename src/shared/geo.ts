/**
 * Approximate map positions. GENZ never shows an exact pin to other brokers: a listing is drawn at locality level.
 * - If the listing has coordinates they are rounded to 2 decimals (~1 km).
 * - Otherwise the point is the city centre plus a stable offset derived from the locality name, so the same locality
 *   always lands at the same spot (≈ within 4 km of the centre). It says "this area", never "this house".
 */
export const CITY_CENTRES: Record<string, [number, number]> = {
  Raipur: [21.2514, 81.6296], Bhilai: [21.209, 81.4285], Bilaspur: [22.0797, 82.1409], Nagpur: [21.1458, 79.0882], Pune: [18.5204, 73.8567],
  Mumbai: [19.076, 72.8777], 'Navi Mumbai': [19.033, 73.0297], Nashik: [19.9975, 73.7898], Bhopal: [23.2599, 77.4126], Indore: [22.7196, 75.8577],
  Jabalpur: [23.1815, 79.9864], Delhi: [28.6139, 77.209], Gurugram: [28.4595, 77.0266], Noida: [28.5355, 77.391], Ghaziabad: [28.6692, 77.4538],
  Lucknow: [26.8467, 80.9462], Kanpur: [26.4499, 80.3319], Varanasi: [25.3176, 82.9739], Prayagraj: [25.4358, 81.8463], Jaipur: [26.9124, 75.7873],
  Ahmedabad: [23.0225, 72.5714], Surat: [21.1702, 72.8311], Vadodara: [22.3072, 73.1812], Hyderabad: [17.385, 78.4867], Bengaluru: [12.9716, 77.5946],
  Chennai: [13.0827, 80.2707], Coimbatore: [11.0168, 76.9558], Kochi: [9.9312, 76.2673], Visakhapatnam: [17.6868, 83.2185], Kolkata: [22.5726, 88.3639],
  Bhubaneswar: [20.2961, 85.8245], Ranchi: [23.3441, 85.3096], Patna: [25.5941, 85.1376], Chandigarh: [30.7333, 76.7794], Dehradun: [30.3165, 78.0322],
  // v98 — more towns, so a broker in any part of India gets his own city (±1–2 km; the pin is blurred anyway)
  Durg: [21.1904, 81.2849], Korba: [22.3595, 82.7501], Raigarh: [21.8974, 83.395], Rajnandgaon: [21.0974, 81.0337], Jagdalpur: [19.0785, 82.0267],
  Thiruvananthapuram: [8.5241, 76.9366], Thrissur: [10.5276, 76.2144], Kozhikode: [11.2588, 75.7804], Mysuru: [12.2958, 76.6394], Mangaluru: [12.9141, 74.856],
  Hubballi: [15.3647, 75.124], Belagavi: [15.8497, 74.4977], Madurai: [9.9252, 78.1198], Tiruchirappalli: [10.7905, 78.7047], Salem: [11.6643, 78.146],
  Vijayawada: [16.5062, 80.648], Guntur: [16.3067, 80.4365], Tirupati: [13.6288, 79.4192], Warangal: [17.9689, 79.5941], Nizamabad: [18.6725, 78.0941],
  Amritsar: [31.634, 74.8723], Ludhiana: [30.901, 75.8573], Jalandhar: [31.326, 75.5762], Faridabad: [28.4089, 77.3178], Panipat: [29.3909, 76.9635],
  Agra: [27.1767, 78.0081], Meerut: [28.9845, 77.7064], Gorakhpur: [26.7606, 83.3732], Bareilly: [28.367, 79.4304], Aligarh: [27.8974, 78.088],
  Mathura: [27.4924, 77.6737], Haridwar: [29.9457, 78.1642], Shimla: [31.1048, 77.1734], Jammu: [32.7266, 74.857], Srinagar: [34.0837, 74.7973],
  Jodhpur: [26.2389, 73.0243], Udaipur: [24.5854, 73.7125], Kota: [25.2138, 75.8648], Ajmer: [26.4499, 74.6399], Bikaner: [28.0229, 73.3119],
  Rajkot: [22.3039, 70.8022], Bhavnagar: [21.7645, 72.1519], Jamnagar: [22.4707, 70.0577], Gandhinagar: [23.2156, 72.6369],
  Gwalior: [26.2183, 78.1828], Ujjain: [23.1765, 75.7885], Sagar: [23.8388, 78.7378], Rewa: [24.5362, 81.3037],
  Aurangabad: [19.8762, 75.3433], 'Chhatrapati Sambhajinagar': [19.8762, 75.3433], Kolhapur: [16.705, 74.2433], Solapur: [17.6599, 75.9064], Thane: [19.2183, 72.9781],
  Guwahati: [26.1445, 91.7362], Imphal: [24.817, 93.9368], Shillong: [25.5788, 91.8933], Agartala: [23.8315, 91.2868], Gangtok: [27.3389, 88.6065],
  Cuttack: [20.4625, 85.883], Jamshedpur: [22.8046, 86.2029], Dhanbad: [23.7957, 86.4304], Siliguri: [26.7271, 88.3953], Gaya: [24.7955, 85.0002],
  Panaji: [15.4909, 73.8278], Puducherry: [11.9416, 79.8083], 'Port Blair': [11.6234, 92.7265],
};
/** when the town is not in the list, the state's middle (so a pin lands in the right state, not in the middle of India) */
export const STATE_CENTRES: Record<string, [number, number]> = {
  'andhra pradesh': [15.9129, 79.74], 'arunachal pradesh': [28.218, 94.7278], assam: [26.2006, 92.9376], bihar: [25.0961, 85.3131], chhattisgarh: [21.2787, 81.8661],
  goa: [15.2993, 74.124], gujarat: [22.2587, 71.1924], haryana: [29.0588, 76.0856], 'himachal pradesh': [31.1048, 77.1734], jharkhand: [23.6102, 85.2799],
  karnataka: [15.3173, 75.7139], kerala: [10.8505, 76.2711], 'madhya pradesh': [22.9734, 78.6569], maharashtra: [19.7515, 75.7139], manipur: [24.6637, 93.9063],
  meghalaya: [25.467, 91.3662], mizoram: [23.1645, 92.9376], nagaland: [26.1584, 94.5624], odisha: [20.9517, 85.0985], punjab: [31.1471, 75.3412],
  rajasthan: [27.0238, 74.2179], sikkim: [27.533, 88.5122], 'tamil nadu': [11.1271, 78.6569], telangana: [18.1124, 79.0193], tripura: [23.9408, 91.9882],
  'uttar pradesh': [26.8467, 80.9462], uttarakhand: [30.0668, 79.0193], 'west bengal': [22.9868, 87.855], delhi: [28.6139, 77.209], chandigarh: [30.7333, 76.7794],
  'jammu and kashmir': [33.7782, 76.5762], ladakh: [34.1526, 77.5771], puducherry: [11.9416, 79.8083],
};
export const INDIA_CENTRE: [number, number] = [22.9734, 78.6569];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function approxPoint(city: string, locality: string, lat?: number, lng?: number, state?: string): { lat: number; lng: number; approx: boolean } {
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 1) {
    return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, approx: true };
  }
  const key = Object.keys(CITY_CENTRES).find(c => c.toLowerCase() === String(city || '').trim().toLowerCase().replace(/\s*\(.*\)\s*/g, ''));
  const stKey = String(state || '').trim().toLowerCase().replace(/^delhi\s*ncr$/, 'delhi');
  const [cLat, cLng] = key ? CITY_CENTRES[key] : (STATE_CENTRES[stKey] || INDIA_CENTRE);
  const h = hash(String(locality || '').trim().toLowerCase());
  const dLat = (((h & 0xffff) / 0xffff) - 0.5) * 0.07; // ± ~3.9 km
  const dLng = ((((h >>> 16) & 0xffff) / 0xffff) - 0.5) * 0.07;
  return { lat: Math.round((cLat + dLat) * 1000) / 1000, lng: Math.round((cLng + dLng) * 1000) / 1000, approx: true };
}

/** Grid clustering for the map: points that fall into the same cell at this zoom level are merged. */
export function clusterPoints<T extends { lat: number; lng: number }>(items: T[], zoom: number): { lat: number; lng: number; items: T[] }[] {
  const cell = 360 / Math.pow(2, zoom) / 3.2;
  const cells = new Map<string, T[]>();
  for (const it of items) {
    const k = `${Math.floor(it.lat / cell)}:${Math.floor(it.lng / cell)}`;
    (cells.get(k) || cells.set(k, []).get(k)!).push(it);
  }
  return [...cells.values()].map(g => ({ lat: g.reduce((a, x) => a + x.lat, 0) / g.length, lng: g.reduce((a, x) => a + x.lng, 0) / g.length, items: g }));
}
