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
};
export const INDIA_CENTRE: [number, number] = [22.9734, 78.6569];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function approxPoint(city: string, locality: string, lat?: number, lng?: number): { lat: number; lng: number; approx: boolean } {
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 1) {
    return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, approx: true };
  }
  const key = Object.keys(CITY_CENTRES).find(c => c.toLowerCase() === String(city || '').trim().toLowerCase().replace(/\s*\(.*\)\s*/g, ''));
  const [cLat, cLng] = key ? CITY_CENTRES[key] : INDIA_CENTRE;
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
