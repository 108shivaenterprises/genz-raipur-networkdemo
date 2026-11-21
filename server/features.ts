/** Feature switches (DECISIONS.md D1). Read at call time so a test or restart with the env changed takes effect. */
import { IS_PROD, DEMO_MODE } from './auth.js';
export const voiceOn = () => String(process.env.FEATURE_VOICE || '').toLowerCase() === 'true';

/** The one public base URL for links sent to people (SMS, QR, inlets). Production boot requires PUBLIC_URL; the Host-header fallback is for dev/demo only. */
export function publicBase(req: { protocol: string; get(h: string): string | undefined }): string {
  const fixed = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  if (process.env.NODE_ENV === 'production' && process.env.PUBLIC_DEMO !== 'true') return '';
  return `${req.protocol}://${req.get('host')}`;
}

/** D5: how a one-time code reaches a person. `manual` = WhatsApp click-to-chat + admin "Pending OTP codes" screen (default in production);
 *  `sms` = Fast2SMS / webhook / Firebase as before; `demo` = demo code shown on screen (only with DEMO_MODE, else it falls back to manual). Not set + not production = `sms` path (which shows the demo code under DEMO_MODE, as before). */
export function otpMode(): 'manual' | 'sms' | 'demo' {
  const v = String(process.env.OTP_MODE || '').trim().toLowerCase();
  if (v === 'sms') return 'sms';
  if (v === 'demo') return DEMO_MODE ? 'demo' : 'manual';
  if (v === 'manual') return 'manual';
  return IS_PROD ? 'manual' : 'sms';
}
