import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, List, Map as MapIcon } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { clusterPoints, INDIA_CENTRE } from '../shared/geo.js';
import { PROPERTY_TYPES } from '../shared/india.js';
import { formatINR } from '../lib/utils.js';

type Pin = { kind: 'LISTING' | 'REQUIREMENT'; id: string; title: string; locality: string; city: string; propertyType: string; transactionType: string; price: number; priceMin?: number; mine: boolean; lat: number; lng: number };
const sel = 'min-h-11 rounded-lg border border-slate-300 bg-white px-2.5 text-sm';

/** Listings and buyer needs on a free OpenStreetMap map. Positions are locality-level only; exact addresses stay private. */
export const MapView: React.FC<{ onOpenProperty?: () => void }> = () => {
  const tx = useTx();
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [show, setShow] = useState<'ALL' | 'LISTING' | 'REQUIREMENT'>('ALL');
  const [type, setType] = useState('');
  const [maxL, setMaxL] = useState('');
  const [zoom, setZoom] = useState(5);
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  // v20: one city at a time (the whole country was too much for a phone); "ALL" still possible
  const [city, setCity] = useState('');        // what the city box shows (the server picks the default)
  const [wanted, setWanted] = useState('');    // what the person asked for — the only thing that triggers a new load
  const [cities, setCities] = useState<{ city: string; n: number }[]>([]);
  const [capped, setCapped] = useState(false);
  useEffect(() => {
    let live = true;
    // the current map stays on screen while the next city loads
    api.mapPins(wanted || undefined).then(r => { if (!live) return; setPins(r.pins); setCities(r.cities || []); setCapped(!!r.capped); setCity(r.city || ''); fitted.current = false; }).catch(e => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [wanted]);
  const filtered = useMemo(() => (pins || []).filter(p => (show === 'ALL' || p.kind === show) && (!type || p.propertyType === type) && (!maxL || p.kind === 'REQUIREMENT' || p.price <= Number(maxL) * 100000)), [pins, show, type, maxL]);

  useEffect(() => {
    if (mode !== 'map' || !pins || !el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(INDIA_CENTRE, 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(m);
    layer.current = L.layerGroup().addTo(m); map.current = m;
    m.on('zoomend', () => setZoom(m.getZoom()));
    return () => { m.stop(); m.remove(); map.current = null; layer.current = null; };
  }, [mode, pins !== null]); // eslint-disable-line react-hooks/exhaustive-deps — new pins must NOT rebuild the map (that removed it mid-animation)

  const fitted = useRef(false);
  useEffect(() => {
    const m = map.current; const g = layer.current;
    if (mode !== 'map' || !m || !g) return;
    g.clearLayers();
    for (const c of clusterPoints(filtered, zoom)) {
      if (c.items.length === 1) {
        const p = c.items[0];
        const dot = L.circleMarker([p.lat, p.lng], { radius: 9, weight: 2, color: '#fff', fillOpacity: 0.95, fillColor: p.kind === 'LISTING' ? (p.mine ? '#0f766e' : '#1d4ed8') : '#d97706' }).addTo(g);
        const box = document.createElement('div'); box.style.minWidth = '170px';
        const b = document.createElement('b'); b.textContent = p.title; box.appendChild(b);
        const l1 = document.createElement('div'); l1.textContent = `${p.locality}${p.city ? ', ' + p.city : ''}`; box.appendChild(l1);
        const l2 = document.createElement('div'); l2.textContent = p.kind === 'LISTING' ? `${p.propertyType} · ${formatINR(p.price)}` : `${tx('Budget', 'बजट')} ${formatINR(p.priceMin)}–${formatINR(p.price)}`; box.appendChild(l2);
        const l3 = document.createElement('div'); l3.style.cssText = 'font-size:10px;color:#64748b;margin-top:4px'; l3.textContent = tx('Approximate area only', 'सिर्फ़ मोटा इलाका'); box.appendChild(l3);
        dot.bindPopup(box);
      } else {
        const n = c.items.length;
        const icon = L.divIcon({ className: '', html: `<div style="background:#0f172a;color:#fff;border:2px solid #fff;border-radius:999px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font:700 13px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n}</div>`, iconSize: [38, 38] });
        L.marker([c.lat, c.lng], { icon, keyboard: false }).addTo(g).on('click', () => m.fitBounds(L.latLngBounds(c.items.map(i => [i.lat, i.lng] as [number, number])).pad(0.4), { maxZoom: 15 }));
      }
    }
    if (!fitted.current && filtered.length) { fitted.current = true; try { m.fitBounds(L.latLngBounds(filtered.map(i => [i.lat, i.lng] as [number, number])).pad(0.3), { maxZoom: 12, animate: false }); } catch { /* map is closing */ } }
  }, [filtered, zoom, mode, tx]);

  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!pins) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {cities.length > 1 && <select value={city} onChange={e => { setCity(e.target.value); setWanted(e.target.value); }} className={sel} aria-label={tx('City', 'शहर')}>{cities.map(c => <option key={c.city} value={c.city}>{c.city} ({c.n})</option>)}<option value="ALL">{tx('All cities', 'सभी शहर')}</option></select>}
        <select value={show} onChange={e => setShow(e.target.value as any)} className={sel} aria-label={tx('Show', 'दिखाएँ')}><option value="ALL">{tx('Listings + needs', 'लिस्टिंग + ज़रूरतें')}</option><option value="LISTING">{tx('Listings', 'लिस्टिंग')}</option><option value="REQUIREMENT">{tx('Buyer needs', 'खरीदार की ज़रूरतें')}</option></select>
        <select value={type} onChange={e => setType(e.target.value)} className={sel} aria-label={tx('Type', 'प्रकार')}><option value="">{tx('All types', 'सभी प्रकार')}</option>{PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}</select>
        <input inputMode="decimal" value={maxL} onChange={e => setMaxL(e.target.value)} placeholder={tx('Max ₹ lakh', 'अधिकतम ₹ लाख')} className={sel + ' w-32'} />
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-slate-300">
          <button onClick={() => setMode('map')} className={`inline-flex min-h-11 items-center gap-1.5 px-3 text-xs font-semibold ${mode === 'map' ? 'bg-slate-900 text-white' : 'bg-white'}`}><MapIcon className="h-4 w-4" aria-hidden />{tx('Map', 'नक्शा')}</button>
          <button onClick={() => setMode('list')} className={`inline-flex min-h-11 items-center gap-1.5 px-3 text-xs font-semibold ${mode === 'list' ? 'bg-slate-900 text-white' : 'bg-white'}`}><List className="h-4 w-4" aria-hidden />{tx('List', 'सूची')}</button>
        </div>
      </div>
      {capped && <p className="text-[11px] font-semibold text-amber-800">{tx('Too many to draw at once — showing the first ones; pick a city or a type to narrow down.', 'एक साथ बहुत ज़्यादा हैं — पहले वाले दिख रहे हैं; शहर या प्रकार चुनकर छोटा करें।')}</p>}
      <p className="text-[11px] text-slate-500">{tx(`${filtered.length} shown. Blue = others’ listings, green = yours, orange = buyer needs. Places are approximate (area level); the exact address opens only after a verified site visit.`, `${filtered.length} दिख रहे हैं। नीला = दूसरों की लिस्टिंग, हरा = आपकी, नारंगी = खरीदार की ज़रूरत। जगह मोटे इलाके की है; सही पता सत्यापित साइट विज़िट के बाद ही खुलता है।`)}</p>
      {mode === 'map' ? <div ref={el} className="h-[60vh] min-h-[320px] w-full overflow-hidden rounded-xl border border-slate-200" role="application" aria-label={tx('Map of listings', 'लिस्टिंग का नक्शा')} /> : (
        filtered.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{tx('Nothing matches these filters.', 'इन फ़िल्टर से कुछ नहीं मिला।')}</p> :
        <ul className="grid gap-2 sm:grid-cols-2">{filtered.map(p => <li key={p.kind + p.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="font-semibold text-slate-900">{p.title}</div><div className="text-xs text-slate-500">{p.locality}, {p.city} · {p.propertyType}</div><div className="mt-1 text-xs font-semibold">{p.kind === 'LISTING' ? formatINR(p.price) : `${formatINR(p.priceMin)}–${formatINR(p.price)}`}</div></li>)}</ul>
      )}
    </div>
  );
};
