import React, { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { INDIA_STATES, citiesOf, localitiesOf, isPincode, findState } from '../shared/india.js';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';

export interface LocationValue {
  state: string;
  city: string;
  locality: string;
  pincode: string;
  district?: string;
}

interface Props {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  /** show the locality input (properties, projects). Requirements pick several localities elsewhere. */
  showLocality?: boolean;
  showPincode?: boolean;
  required?: boolean;
  /** extra locality suggestions (e.g. from India Post lookup) are merged automatically */
  className?: string;
}

const input = 'mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none';

/**
 * Pan-India location picker: State / UT → City / town → Locality (suggestions, free text allowed) → PIN code.
 * Typing a 6-digit PIN fills state / district / city when the India Post lookup is reachable.
 */
export const LocationFields: React.FC<Props> = ({ value, onChange, showLocality = true, showPincode = true, required = true, className = '' }) => {
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const [busy, setBusy] = useState(false);
  const [pinNote, setPinNote] = useState('');
  const [pinLocalities, setPinLocalities] = useState<string[]>([]);

  const set = (patch: Partial<LocationValue>) => onChange({ ...value, ...patch });
  const cities = citiesOf(value.state);
  const suggestions = [...new Set([...localitiesOf(value.city), ...pinLocalities])];

  const lookup = async (pin: string) => {
    if (!isPincode(pin)) { setPinNote(''); return; }
    setBusy(true); setPinNote('');
    try {
      const r = await api.lookupPincode(pin.trim());
      if (r.found) {
        const st = findState(r.state)?.name || value.state;
        onChange({ ...value, pincode: pin.trim(), state: st, district: r.district || value.district, city: value.city || r.city || r.district || '' });
        setPinLocalities(r.localities || []);
        setPinNote(`${r.district || ''}${r.state ? ', ' + r.state : ''}`);
      } else {
        setPinNote(r.unavailable ? (hi ? 'पिनकोड लुकअप अभी उपलब्ध नहीं — हाथ से भरें' : 'PIN lookup unavailable right now — fill manually') : (hi ? 'पिनकोड नहीं मिला' : 'PIN code not found'));
      }
    } catch {
      setPinNote(hi ? 'लुकअप विफल — हाथ से भरें' : 'Lookup failed — fill manually');
    } finally {
      setBusy(false);
    }
  };

  const dlId = React.useId();
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${className}`}>
      {showPincode && (
        <div>
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {hi ? 'पिनकोड' : 'PIN code'}
            {busy && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          </label>
          <input
            inputMode="numeric"
            maxLength={6}
            value={value.pincode}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              set({ pincode: v });
              if (v.length === 6) void lookup(v);
            }}
            placeholder="492001"
            className={input}
          />
          {pinNote && <p className="mt-0.5 text-[10px] text-slate-500">{pinNote}</p>}
        </div>
      )}
      <div>
        <label className="text-xs font-semibold text-slate-700">{hi ? 'राज्य / केंद्र शासित प्रदेश' : 'State / UT'}</label>
        <select
          required={required}
          value={value.state}
          onChange={(e) => set({ state: e.target.value, city: '', locality: '' })}
          className={input}
        >
          <option value="">{hi ? '— चुनें —' : '— Select —'}</option>
          {INDIA_STATES.map((s) => (
            <option key={s.name} value={s.name}>{hi ? `${s.hi} (${s.name})` : s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-700">{hi ? 'शहर / कस्बा' : 'City / town'}</label>
        <input
          required={required}
          list={`${dlId}-cities`}
          value={value.city}
          onChange={(e) => set({ city: e.target.value, locality: e.target.value === value.city ? value.locality : '' })}
          placeholder={hi ? 'चुनें या लिखें' : 'Pick or type'}
          className={input}
        />
        <datalist id={`${dlId}-cities`}>{cities.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      {showLocality && (
        <div>
          <label className="text-xs font-semibold text-slate-700">{hi ? 'इलाका / कॉलोनी' : 'Locality / area'}</label>
          <input
            required={required}
            list={`${dlId}-loc`}
            value={value.locality}
            onChange={(e) => set({ locality: e.target.value })}
            placeholder={hi ? 'जैसे शंकर नगर, अंधेरी वेस्ट' : 'e.g. Shankar Nagar, Andheri West'}
            className={input}
          />
          <datalist id={`${dlId}-loc`}>{suggestions.map((l) => <option key={l} value={l} />)}</datalist>
        </div>
      )}
    </div>
  );
};
