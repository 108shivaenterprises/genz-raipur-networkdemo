import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendSms, smsGateway } from '../server/notify';
import { firebaseOn } from '../server/phoneOtp';

/** v134 — Fast2SMS: codes go by its OTP API when an OTP id is set, everything else by Quick SMS; the key goes only in the header. */
const KEYS = ['FAST2SMS_API_KEY', 'FAST2SMS_OTP_ID', 'SMS_WEBHOOK_URL', 'FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID'];
const saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.unstubAllGlobals(); });
const calls: any[] = [];
const stub = (res: object = { return: true }, status = 200) => { calls.length = 0; vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => { calls.push({ url, init, body: JSON.parse(init.body) }); return new Response(JSON.stringify(res), { status }); })); };
const on = (otpId?: string) => { delete process.env.SMS_WEBHOOK_URL; process.env.FAST2SMS_API_KEY = 'test-key'; if (otpId) process.env.FAST2SMS_OTP_ID = otpId; else delete process.env.FAST2SMS_OTP_ID; };

describe('Fast2SMS', () => {
  it('a code with an OTP id → OTP API with our own code; key only in the header', async () => {
    on('T1'); stub(); await sendSms('+919123456789', 'GENZ: your code to open your private property room is 482913. Valid 10 minutes.');
    expect(calls).toHaveLength(1); expect(calls[0].url).toBe('https://www.fast2sms.com/dev/otp/send');
    expect(calls[0].body).toEqual({ mobile: '9123456789', otp_id: 'T1', otp: '482913', otp_expiry: 10 });
    expect(calls[0].init.headers.Authorization).toBe('test-key'); expect(calls[0].init.body).not.toContain('test-key');
  });
  it('no OTP id, or a message without a code → Quick SMS with the full text', async () => {
    on(); stub(); await sendSms('9123456789', 'GENZ: your code to reopen your chat is 111222.');
    expect(calls[0].url).toBe('https://www.fast2sms.com/dev/bulkV2'); expect(calls[0].body).toEqual({ route: 'q', message: 'GENZ: your code to reopen your chat is 111222.', numbers: '9123456789' });
    on('T1'); stub(); await sendSms('+919123456789', 'GENZ: your visit is tomorrow at 11.'); expect(calls[0].body.route).toBe('q');
  });
  it('a foreign or broken number is not sent; a refusal is logged without the message', async () => {
    on(); stub(); await sendSms('+14155550100', 'code 123456'); await sendSms('12345', 'code 123456'); expect(calls).toHaveLength(0);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    stub({ return: false, message: 'Insufficient balance' }, 400); await sendSms('9123456789', 'GENZ code 654321');
    expect(err.mock.calls.join(' ')).toContain('Insufficient balance'); expect(err.mock.calls.join(' ')).not.toContain('654321'); err.mockRestore();
  });
  it('Fast2SMS counts as SMS on, and switches the Firebase page off (else two codes)', () => {
    delete process.env.FAST2SMS_API_KEY; delete process.env.SMS_WEBHOOK_URL; process.env.FIREBASE_API_KEY = 'a'; process.env.FIREBASE_PROJECT_ID = 'p';
    expect(smsGateway()).toBe(false); expect(firebaseOn()).toBe(true);
    on(); expect(smsGateway()).toBe(true); expect(firebaseOn()).toBe(false);
  });
});
