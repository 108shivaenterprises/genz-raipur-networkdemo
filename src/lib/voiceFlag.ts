import { useEffect, useState } from 'react';
import { api } from './api.js';

/** D1: speech-to-text mic is hidden unless the server says FEATURE_VOICE is on (read once from /api/auth/config). */
let cached: Promise<boolean> | null = null;
const load = () => (cached ||= api.authConfig().then(c => !!c.voice).catch(() => false));
export const useVoiceFlag = (): boolean => {
  const [on, setOn] = useState(false);
  useEffect(() => { let live = true; void load().then(v => { if (live) setOn(v); }); return () => { live = false; }; }, []);
  return on;
};
