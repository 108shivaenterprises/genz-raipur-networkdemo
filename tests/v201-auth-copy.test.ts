import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const read = (f: string) => readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8');

describe('v201 · B1 sign-in and sign-up copy', () => {
  it('login 400 / 401 / 429 and the 2FA ticket errors carry a Hindi line; one 401 for unknown email and wrong password', () => {
    const s = read('server.ts');
    for (const t of ["errorHi: 'ई-मेल और पासवर्ड ज़रूरी हैं'", "errorHi: 'ई-मेल या पासवर्ड ग़लत है'", "errorHi: `बहुत ज़्यादा ग़लत कोशिशें।", "errorHi: 'साइन-इन में बहुत देर हो गई।", "errorHi: 'फिर से साइन इन करें।'"]) expect(s).toContain(t);
    expect(s.match(/'Invalid email or password'/g)!.length).toBe(1);   // same answer whether the account exists or not
  });
  it('a reused sign-up code says the same in English and Hindi (already used, ask for a new one)', async () => {
    process.env.AUTH_SECRET ||= 'test-secret-v201';
    const { OTP_HI } = await import('../server/ownerlist');
    expect(OTP_HI['That code was already used — ask for a new one.']).toBe('यह कोड पहले इस्तेमाल हो चुका — नया कोड माँगें।');
    expect(read('server/openSignup.ts')).toContain('OTP_HI[otpErr]');
    expect(read('server/ownerlist.ts')).toMatch(/already used — ask for a new one\.', 400, 'USED', OTP_HI/);
  });
  it('sign-up form is noValidate and every required field has an in-app bilingual line; locality is required for every BROKER', () => {
    const j = read('src/components/JoinView.tsx');
    expect(j).toContain('onSubmit={submit} noValidate'); expect(j).toContain("if (role === 'BROKER' && !loc.locality.trim())");
    for (const t of ['अपना पूरा नाम लिखें।', 'सही 10 अंकों का मोबाइल नंबर डालें।', 'सही ई-मेल पता डालें।', 'पासवर्ड चुनें।', 'अपना इलाका / कॉलोनी लिखें']) expect(j).toContain(t);
  });
  it('forgot password shows why the button is off', () => {
    const f = read('src/components/ForgotPassword.tsx'); expect(f).toContain('Enter your 10-digit mobile'); expect(f).toContain('अपना 10 अंकों का मोबाइल नंबर डालें'); expect(f).toContain('forgot-phone-hint');
  });
});
