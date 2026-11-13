/**
 * Outbound notification hook for OTPs / alerts.
 * - SMS_WEBHOOK_URL set  → POST {to, message} (plug in MSG91 / Twilio / WhatsApp Business via a tiny relay)
 * - FAST2SMS_API_KEY set → Fast2SMS (v134): a 6-digit code goes by its OTP API when FAST2SMS_OTP_ID is set,
 *                          everything else (and codes without an OTP id) by its Quick SMS route
 * - not set              → message is written to the server console (local development)
 * The OTP value is never logged in production unless SMS_WEBHOOK_URL is absent *and* DEMO_MODE is on.
 */
import { DEMO_MODE } from './auth.js';
import { firebaseOn, stashOtp } from './phoneOtp.js';
import { apiKey } from './apiKeys.js';

/** v134 — one answer to "can we text this phone?" for every flow (Firebase is counted separately where it fits) */
export const smsGateway = () => !!(apiKey('SMS_WEBHOOK_URL') || apiKey('FAST2SMS_API_KEY'));

const F2S = 'https://www.fast2sms.com/dev';
async function fast2sms(key: string, to: string, message: string): Promise<void> {
  const mobile = to.replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(mobile)) { console.warn('[NOTIFY] Fast2SMS: not an Indian mobile, not sent.'); return; }
  const code = /\b(\d{6})\b/.exec(message)?.[1]; const otpId = apiKey('FAST2SMS_OTP_ID');
  const [path, body] = code && otpId
    ? ['/otp/send', { mobile, otp_id: otpId, otp: code, otp_expiry: 10 }]
    : ['/bulkV2', { route: 'q', message, numbers: mobile }];
  try {
    const r = await fetch(F2S + path, { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.return === false) console.error(`[NOTIFY] Fast2SMS ${path} failed: ${r.status} ${String(j.message ?? '').slice(0, 120)}`);   // never log the message: it can hold a code
  } catch (e) { console.error('[NOTIFY] Fast2SMS failed:', (e as Error).message); }
}

export async function sendSms(to: string, message: string): Promise<void> {
  const url = apiKey('SMS_WEBHOOK_URL'); const token = apiKey('SMS_WEBHOOK_TOKEN');
  if (url) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ to, message }),
      });
    } catch (e) {
      console.error('[NOTIFY] SMS webhook failed:', (e as Error).message);
    }
    return;
  }
  const f2s = apiKey('FAST2SMS_API_KEY');
  if (f2s) return fast2sms(f2s, to, message);
  if (firebaseOn()) { if (!stashOtp(to, message)) console.warn('[NOTIFY] Firebase OTP is on: only codes can reach a phone; this message was not delivered.'); return; }   // v133
  if (DEMO_MODE) console.log(`[NOTIFY:sms-simulated] → ${to}: ${message}`);
  else console.warn(`[NOTIFY] SMS gateway not configured (SMS_WEBHOOK_URL / FAST2SMS_API_KEY); message to ${to} not delivered.`);
}
