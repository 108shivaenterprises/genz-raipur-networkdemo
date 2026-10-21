/**
 * Outbound notification hook for OTPs / alerts.
 * - SMS_WEBHOOK_URL set  → POST {to, message} (plug in MSG91 / Twilio / WhatsApp Business via a tiny relay)
 * - not set              → message is written to the server console (local development)
 * The OTP value is never logged in production unless SMS_WEBHOOK_URL is absent *and* DEMO_MODE is on.
 */
import { DEMO_MODE } from './auth.js';

export async function sendSms(to: string, message: string): Promise<void> {
  const url = process.env.SMS_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` } : {}),
        },
        body: JSON.stringify({ to, message }),
      });
    } catch (e) {
      console.error('[NOTIFY] SMS webhook failed:', (e as Error).message);
    }
    return;
  }
  if (DEMO_MODE) console.log(`[NOTIFY:sms-simulated] → ${to}: ${message}`);
  else console.warn(`[NOTIFY] SMS gateway not configured (SMS_WEBHOOK_URL); message to ${to} not delivered.`);
}
