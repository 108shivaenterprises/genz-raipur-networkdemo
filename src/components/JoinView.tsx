import { previewLine, useBasicPreview } from './BasicBanner.js';
import React, { useEffect, useState } from 'react';
import { bilingualInvalid } from '../lib/validate.js';
import { Loader2, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { OtpSent, OtpAlert, type OtpReq, type OtpErr } from './OtpStep.js';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { LocationFields, LocationValue } from './LocationFields.js';
import { AreaChips } from './AreaChips.js';
import { SHOP_TYPES } from '../shared/connector.js';
import { isValidPan, normPan, normAadhaar, isValidAadhaar, panProblem, aadhaarProblem, AADHAAR_NOTE, ID_DOC_NOTE } from '../shared/idRules.js';
import { KYC_CONSENT, addressProblem, pinProblem, normAddress, normPin } from '../shared/kycRules.js';
import { IdDocSlot } from './IdDocSlot.js';
import { IdPhotoReader } from './IdPhotoReader.js';
import type { PreparedIdFile } from '../lib/idFile.js';

const ROLE_LABEL: Record<string, string> = {
  BROKER: 'Real-estate Broker', PROPERTY_OWNER: 'Property Owner', BUYER_TENANT: 'Buyer / Tenant', CONTRACTOR: 'Contractor',
  DEVELOPER_BUILDER: 'Developer / Builder', LEGAL_COUNSEL: 'Legal Counsel', ADMIN: 'Administrator', GENZ_CONNECTOR: 'GENZ Connector (local partner)',
};
const input = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none';

/** Public sign-up with an invitation code (no login needed). The account then waits for admin KYC verification. */
export const JoinView: React.FC<{ onBack: () => void; onOwner?: () => void; onJoined?: () => void }> = ({ onBack, onOwner, onJoined }) => {
  const previewN = useBasicPreview();
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const [code, setCode] = useState('');
  // v185 (D15): SIGNUP_MODE=open (default) → no invitation code: role → mobile OTP → name, city, PAN → live in the Basic tier. 'invite' (or "I have a code") = the old flow.
  const [mode, setMode] = useState<'open' | 'invite' | ''>('');
  const [useCode, setUseCode] = useState(false);
  const [openRole, setOpenRole] = useState('');
  useEffect(() => { api.authConfig().then(c => setMode(c.signupMode === 'invite' ? 'invite' : 'open')).catch(() => setMode('invite')); }, []);
  const isOpen = mode === 'open' && !useCode;
  const [inv0, setInv] = useState<{ targetRole: string; invitedPhone: string; invitedEmail: string } | null>(null);
  const inv = inv0 || (isOpen && openRole ? { targetRole: openRole, invitedPhone: '', invitedEmail: 'open@phone.genz.local', open: true } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // v141 — mobile OTP: with it and a valid PAN the account is live at once (no GENZ desk)
  const [otpTok, setOtpTok] = useState(''); const [otpCode, setOtpCode] = useState(''); const [otpV, setOtpV] = useState<OtpReq | null>(null); const [otpErr, setOtpErr] = useState<OtpErr | null>(null); const [otpAt, setOtpAt] = useState(0); const [otpBusy, setOtpBusy] = useState(false);
  const sendOtp = async () => {
    setOtpBusy(true); setOtpErr(null);
    try { const p10 = phone.replace(/\D/g, '').slice(-10); const r = isOpen ? await api.signupOtp(p10) : await api.registerOtp(code.trim(), p10); setOtpTok(r.otpToken); setOtpV(r); setOtpAt(Date.now()); setOtpCode(''); }
    catch (e: any) { setOtpTok(''); setOtpV(null); setOtpErr(e); } finally { setOtpBusy(false); }
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loc, setLoc] = useState<LocationValue>({ state: '', city: '', locality: '', pincode: '' });
  const [areas, setAreas] = useState<string[]>([]);
  const [company, setCompany] = useState('');
  const [rera, setRera] = useState('');
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [shopType, setShopType] = useState('KIRANA_STORE');
  const [shopName, setShopName] = useState('');
  const [upi, setUpi] = useState('');
  const [consent, setConsent] = useState(false);
  const [aadhaar, setAadhaar] = useState('');
  const [idConsent, setIdConsent] = useState(false);
  // v25: address (as on Aadhaar) + PIN; `fromPhoto` = at least one value came from “Fill from photo”
  const [address, setAddress] = useState(''); const [pincode, setPincode] = useState(''); const [fromPhoto, setFromPhoto] = useState(false);
  // v19: what the sponsor already filled in (the form opens PREFILLED), the copies he uploaded, and the copies this person adds now
  const [pf, setPf] = useState<{ name: string; city: string; companyName: string; panNumber: string; hasPan?: boolean; aadhaarLast4: string; docs: string[] } | null>(null);
  const [files, setFiles] = useState<{ PAN?: PreparedIdFile; AADHAAR?: PreparedIdFile }>({});
  const [autoVerified, setAutoVerified] = useState(false);
  const [basicDone, setBasicDone] = useState(false); const [panConsent, setPanConsent] = useState(false);
  const [uploadNote, setUploadNote] = useState('');

  const role = inv?.targetRole;
  const phoneOnly = !!inv?.invitedEmail?.endsWith('@phone.genz.local');
  const tier2 = !!(inv as any)?.tier2;
  const sponsorName: string = (inv as any)?.sponsorName || '';
  const open = !!(inv as any)?.open;
  const needsRera = (role === 'BROKER' || role === 'DEVELOPER_BUILDER') && !tier2 && !open;
  // v18: every broker gives PAN + Aadhaar (only the last 4 digits are kept)
  const brokerId = role === 'BROKER' && !open;
  const aadhaarDigits = normAadhaar(aadhaar);
  const panMasked = !!pf?.hasPan && pan === pf.panNumber;   // F1: the sponsor's PAN arrives masked; the server keeps using the stored one
  const panIssue = panMasked ? null : panProblem(pan);
  const aadhaarIssue = aadhaarProblem(aadhaarDigits);
  const addrIssue = address ? addressProblem(address) : null;
  const pinIssue = pincode ? pinProblem(pincode) : null;
  const last4Differs = !!pf?.aadhaarLast4 && aadhaarDigits.length === 12 && aadhaarDigits.slice(-4) !== pf.aadhaarLast4;
  const chip = (cur: string, orig?: string) => (orig && cur.trim() === orig ? <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">{hi ? 'स्पॉन्सर ने भरा' : 'filled by your sponsor'}</span> : null);

  const check = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await api.validateInvite(code.trim());
      if (!r.valid || !r.invitation) throw new Error(r.error || 'Invalid or expired invitation code');
      setInv(r.invitation as any);
      setPhone(r.invitation.invitedPhone || '');
      if (!r.invitation.invitedEmail.endsWith('@phone.genz.local')) setEmail(r.invitation.invitedEmail);
      const p = (r.invitation as any).prefill;
      if (p) {
        setPf(p); setName(p.name || ''); setCompany(p.companyName || ''); setPan(p.panNumber || '');
        setLoc(l => ({ ...l, city: p.city || l.city }));
      }
    } catch (err: any) { setError(err.message || 'Invalid or expired invitation code'); }
    finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!name.trim()) { setError(hi ? 'अपना पूरा नाम लिखें।' : 'Enter your full name.'); return; }
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, '').slice(-10))) { setError(hi ? 'सही 10 अंकों का मोबाइल नंबर डालें।' : 'Enter a valid 10-digit mobile number.'); return; }
    if (!phoneOnly && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError(hi ? 'सही ई-मेल पता डालें।' : 'Enter a valid e-mail address.'); return; }
    if (!password) { setError(hi ? 'पासवर्ड चुनें।' : 'Choose a password.'); return; }
    if (brokerId) {
      if (!panMasked && !isValidPan(normPan(pan))) { const w = panProblem(pan); setError(w ? (hi ? w.hi : w.en) : (hi ? 'PAN डालें (जैसे ABCPD1234E)' : 'Enter your PAN (e.g. ABCPD1234E)')); return; }
      if (!isValidAadhaar(aadhaarDigits)) { const w = aadhaarProblem(aadhaarDigits); setError(w ? (hi ? w.hi : w.en) : (hi ? 'आधार नंबर डालें (12 अंक)' : 'Enter your Aadhaar number (12 digits)')); return; }
      if (addrIssue || pinIssue) { const w = addrIssue || pinIssue!; setError(hi ? w.hi : w.en); return; }
      if (!idConsent) { setError(hi ? 'PAN, आधार नंबर और पता रखने की सहमति दें' : 'Please agree to GENZ keeping your PAN, Aadhaar number and address'); return; }
    }
    if (role === 'BROKER' && !loc.locality.trim()) { setError(hi ? 'अपना इलाका / कॉलोनी लिखें (जैसे शंकर नगर)।' : 'Enter your locality / area (for example Shankar Nagar).'); return; }
    if (!loc.city.trim() && !(open && role === 'GENZ_CONNECTOR')) { setError(hi ? 'अपना शहर चुनें — GENZ क्लाइंट और घर शहर के हिसाब से मिलाता है।' : 'Choose your city — GENZ matches clients and homes city by city.'); return; }
    if (!open && (role === 'BUYER_TENANT' || role === 'PROPERTY_OWNER') && (!otpTok || otpCode.length !== 6)) { setError(hi ? 'पहले मोबाइल पर कोड भेजें और उसे यहाँ डालें।' : 'Send the code to your mobile first and enter it here.'); return; }
    if (open) {
      if (!otpTok || otpCode.length !== 6) { setError(hi ? 'पहले मोबाइल पर कोड भेजें और उसे यहाँ डालें।' : 'Send the code to your mobile first and enter it here.'); return; }
      if (role !== 'GENZ_CONNECTOR' && !panConsent) { setError(hi ? 'PAN रखने की सहमति दें (नीचे टिक करें)।' : 'Please tick that GENZ may keep your PAN to check your KYC.'); return; }
      if (role !== 'GENZ_CONNECTOR' && !isValidPan(normPan(pan))) { const w = panProblem(pan); setError(w ? (hi ? w.hi : w.en) : (hi ? 'PAN डालें (जैसे ABCPD1234E)' : 'Enter your PAN (e.g. ABCPD1234E)')); return; }
      setBusy(true);
      try {
        await api.openSignup({ role, name, phone: phone.replace(/\D/g, '').slice(-10), otpToken: otpTok, otpCode, password, consent: true, panConsent: role !== 'GENZ_CONNECTOR' ? panConsent : undefined, panNumber: pan ? normPan(pan) : undefined, state: loc.state || undefined, city: loc.city || undefined, locality: loc.locality || undefined, companyName: company || undefined,
          ...(role === 'GENZ_CONNECTOR' ? { shopType, shopName, payoutUpi: upi || undefined } : {}) });
        setAutoVerified(true); setBasicDone(true); setDone(`${hi ? 'मोबाइल नंबर से साइन इन करें' : 'Sign in with your mobile number'} ${phone}.`);
      } catch (err: any) { setError(err.message || (hi ? 'साइन-अप नहीं हो पाया' : 'Sign-up failed')); }
      finally { setBusy(false); }
      return;
    }
    setBusy(true);
    try {
      const reg = await api.registerInvite({
        code: code.trim(), name, phone, email: phoneOnly ? undefined : email, password, consent: true, ...(otpTok ? { otpToken: otpTok, otpCode } : {}),
        state: loc.state || undefined, city: loc.city || undefined, locality: role !== 'GENZ_CONNECTOR' ? (loc.locality || undefined) : undefined, areas: areas.length ? areas : undefined,
        ...(brokerId ? { aadhaarNumber: aadhaarDigits, idConsent: true, kycConsent: true, address: address ? normAddress(address) : undefined, pincode: pincode ? normPin(pincode) : undefined, kycSource: fromPhoto ? 'PHOTO' : 'TYPED' } : {}),
        ...(needsRera ? { companyName: company || undefined, reraNumber: rera || undefined, panNumber: panMasked ? undefined : normPan(pan) || undefined, gstin: gstin || undefined } : {}),
        ...(role === 'GENZ_CONNECTOR' ? { shopType, shopName, locality: loc.locality || undefined, payoutUpi: upi || undefined } : {}),
        ...(tier2 ? { companyName: company || undefined, reraNumber: rera || undefined, panNumber: panMasked ? undefined : normPan(pan) || undefined } : {}),
        ...(role !== 'GENZ_CONNECTOR' && !needsRera && !tier2 ? { companyName: company || undefined, panNumber: panMasked ? undefined : pan || undefined } : {}),
      } as any);
      // v19: the account exists now (and is signed in), so the chosen PAN / Aadhaar copies can go up; a failure here never undoes the registration
      const failed: string[] = [];
      for (const k of ['PAN', 'AADHAAR'] as const) { const f = files[k]; if (f) { try { await api.idMineUpload({ kind: k, fileName: f.fileName, data: f.data }); } catch (e: any) { failed.push(`${k}: ${e.message}`); } } }
      setUploadNote(failed.length ? (hi ? `आपका आवेदन जमा हो गया, पर एक कॉपी अपलोड नहीं हुई (${failed.join('; ')}). साइन-इन के बाद नेटवर्क → रजिस्टर और ID में दोबारा डालें।` : `Your application is in, but a copy was not uploaded (${failed.join('; ')}). After signing in add it under Network → Register & ID.`) : '');
      setAutoVerified(!!reg.autoVerified); setBasicDone(!!(reg as any).basic);
      setDone(phoneOnly ? `Sign in later with your mobile number ${phone}.` : `Sign in later with ${email}.`);
    } catch (err: any) { setError(err.message || 'Registration failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" /> {hi ? 'साइन इन पर वापस' : 'Back to sign in'}</button>
        <h1 className="flex items-center gap-2 text-base font-bold text-slate-900"><KeyRound className="h-4 w-4 text-amber-500" /> {isOpen ? (hi ? 'GENZ से जुड़ें — मुफ़्त' : 'Join GENZ — free') : (hi ? 'आमंत्रण कोड से जुड़ें' : 'Join with your invitation code')}</h1>

        {done ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="mb-1 h-5 w-5 text-emerald-600" />
            <p className="font-semibold" data-testid="join-done">{open || basicDone ? (hi ? 'आपका अकाउंट चालू है (बेसिक)!' : 'Your account is live (Basic)!') : autoVerified ? (hi ? 'आप वेरिफ़ाइड हैं!' : 'You are verified!') : (hi ? 'आवेदन जमा हो गया!' : 'Application submitted!')}</p>
            <p className="mt-1 text-xs">{open || basicDone ? (previewLine((en, h) => hi ? h : en, previewN) + ' ' + (hi ? 'अपनी लिस्टिंग और क्लाइंट जोड़ सकते हैं और चैट कर सकते हैं। RERA नहीं है तो Tier 2 एसोसिएट के रूप में वेरिफ़ाई हो सकते हैं। RERA बाद में जोड़ें तो GENZ जाँचकर मंज़ूर करे, तभी Tier 1 मिलेगा। साइन इन के बाद “KYC वेरिफ़ाई करें” चुनें।' : 'You can add your own listings and clients and chat. No RERA? You can still be verified as a Tier 2 associate. If you add RERA later, GENZ checks it and approves it before you become Tier 1. After signing in, pick “Verify KYC”.')) : autoVerified
              ? (hi ? `आपके मोबाइल OTP और PAN से आप तुरंत वेरिफ़ाई हो गए। GENZ टीम आपकी PAN / आधार ID बाद में देखेगी — ज़रूरत हो तो वह आपसे संपर्क करेगी।` : `You were verified straight away through your mobile OTP and PAN. The GENZ team will check your PAN / Aadhaar ID afterwards and will contact you if anything is needed.`)
              : (hi ? 'GENZ टीम आपके विवरण की जाँच करेगी। मंज़ूरी के बाद आप साइन इन कर पाएँगे।' : 'The GENZ team will verify your details. You can sign in once you are approved.')} {done}</p>
            {uploadNote && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{uploadNote}</p>}
            {basicDone && onJoined && <button onClick={onJoined} className="mt-3 mr-2 inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white" data-testid="join-continue">{hi ? 'GENZ में आगे बढ़ें' : 'Continue to GENZ'}</button>}
            <button onClick={onBack} className={`mt-3 inline-flex min-h-11 items-center rounded-lg px-4 text-xs font-semibold ${basicDone && onJoined ? 'border border-slate-300 bg-white text-slate-700' : 'bg-slate-900 text-white'}`}>{hi ? 'साइन इन पेज' : 'Go to sign in'}</button>
          </div>
        ) : mode === '' ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {hi ? 'लोड हो रहा है…' : 'Loading…'}</p>
        ) : isOpen && !inv ? (
          <div className="mt-4 space-y-2" data-testid="join-roles">
            <p className="text-xs text-slate-600">{hi ? 'आप कौन हैं? चुनें — आगे मोबाइल कोड, फिर नाम, शहर और PAN।' : 'Who are you? Choose one — next a mobile code, then your name, city and PAN.'}</p>
            {([['BROKER', 'Real-estate broker', 'रियल एस्टेट ब्रोकर'], ['PROPERTY_OWNER', 'Property owner', 'प्रॉपर्टी मालिक'], ['DEVELOPER_BUILDER', 'Builder / developer partner', 'बिल्डर / डेवलपर पार्टनर'], ['GENZ_CONNECTOR', 'Shop partner', 'दुकान पार्टनर']] as const).map(([k, en, h]) => (
              <button key={k} type="button" data-testid={`join-role-${k}`} onClick={() => { if (k === 'PROPERTY_OWNER' && onOwner) onOwner(); else setOpenRole(k); }} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-left text-sm font-semibold text-slate-900 hover:border-slate-900">{hi ? h : en}<span aria-hidden>›</span></button>
            ))}
            <button type="button" onClick={() => setUseCode(true)} className="min-h-11 w-full text-xs font-semibold text-blue-700 underline" data-testid="join-have-code">{hi ? 'आमंत्रण कोड है? यहाँ से जुड़ें' : 'Have an invitation code? Join here'}</button>
          </div>
        ) : !inv ? (
          <form onSubmit={check} className="mt-4" {...bilingualInvalid(hi)}>
            <p className="text-xs text-slate-500">{hi ? 'GENZ टीम से मिला कोड यहाँ डालें।' : 'Enter the code you received from the GENZ team.'}</p>
            <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="GZ-XXX-XXXXXXXXXXXX" className={input + ' font-mono tracking-wide'} />
            {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
            <button disabled={busy} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {hi ? 'कोड जाँचें' : 'Check code'}</button>
          </form>
        ) : (
          <form onSubmit={submit} noValidate className="mt-4 space-y-3" {...bilingualInvalid(hi)}>   {/* B1-02 — no browser bubble: every missing field gets the in-app bilingual line */}
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{hi ? 'आप जुड़ रहे हैं:' : 'You are joining as:'} <b className="text-slate-900">{ROLE_LABEL[role!] || role}</b></p>
            {pf && <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">{hi ? `आपके स्पॉन्सर ${sponsorName || ''} ने आपकी कुछ जानकारी पहले से भर दी है। उसे देख लें और कुछ ग़लत हो तो सुधार दें।` : `Your sponsor${sponsorName ? ` ${sponsorName}` : ''} has already filled in some of your details. Please check them and correct anything that is wrong.`}</p>}
            <div><label className="text-xs font-semibold text-slate-700">{hi ? 'पूरा नाम' : 'Full name'} *{chip(name, pf?.name)}</label><input required value={name} onChange={(e) => setName(e.target.value)} className={input} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="text-xs font-semibold text-slate-700">{hi ? 'मोबाइल नंबर' : 'Mobile number'} *</label><input required value={phone} onChange={(e) => { setPhone(e.target.value); setOtpTok(''); setOtpV(null); }} inputMode="tel" placeholder="9XXXXXXXXX" className={input} />
                {(role !== 'GENZ_CONNECTOR' || open) && <div className="mt-1.5 space-y-1" data-testid="join-otp">
                  {!otpV && <button type="button" onClick={() => void sendOtp()} disabled={otpBusy || !/^[6-9]\d{9}$/.test(phone.replace(/\D/g, '').slice(-10))} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold disabled:opacity-40" data-testid="join-otp-send">{hi ? 'कोड भेजें' : 'Send code'}</button>}
                  {otpV && <OtpSent v={otpV} sentAt={otpAt} onResend={() => void sendOtp()} busy={otpBusy} />}
                  {otpTok && <input value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder={hi ? '6 अंक का कोड' : '6-digit code'} className={input + ' font-mono'} aria-label={hi ? 'कोड' : 'Code'} data-testid="join-otp-code" />}
                  <OtpAlert err={otpErr} />
                  <p className="text-[11px] text-slate-500">{open || role === 'BUYER_TENANT' || role === 'PROPERTY_OWNER' ? (hi ? 'कोड ज़रूरी है — पहले अपना मोबाइल वेरिफ़ाई करें, फिर साइन-अप पूरा होगा।' : 'The code is required — verify your mobile first, then sign-up completes.') : (hi ? 'मोबाइल कोड + PAN = अकाउंट तुरंत चालू। बिना कोड के GENZ ID जाँचेगा।' : 'Mobile code + PAN = your account is live at once. Without the code GENZ checks your ID.')}</p>
                </div>}</div>
              {!phoneOnly && <div><label className="text-xs font-semibold text-slate-700" htmlFor="join-email">{hi ? 'ईमेल' : 'Email'} *</label><input id="join-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} /></div>}
            </div>
            <LocationFields value={loc} onChange={setLoc} showLocality showPincode={false} required />
            {role !== 'GENZ_CONNECTOR' && (
              <AreaChips city={loc.city} value={areas} onChange={setAreas} testId="join-areas"
                label={hi ? 'आप किन इलाकों में काम करते हैं?' : 'Which areas do you work in?'}
                hint={hi ? 'शहर में बहुत इलाके होते हैं — इससे नेटवर्क को पता चलता है कि कौन कहाँ का है और सही क्लाइंट/घर आपको मिलते हैं।' : 'A city has many areas — this tells the network who covers where, so the right clients and homes reach you.'} />
            )}

            {open && role !== 'GENZ_CONNECTOR' && (
              <div><label className="text-xs font-semibold text-slate-700" htmlFor="join-pan-input">PAN *</label><input id="join-pan-input" required maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().replace(/\s/g, ''))} className={input + ' font-mono'} aria-invalid={!!panIssue} data-testid="join-pan" placeholder="ABCPD1234E" />{panIssue && pan && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{hi ? panIssue.hi : panIssue.en}</p>}
                <label className="mt-1 flex min-h-11 items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={panConsent} onChange={(e) => setPanConsent(e.target.checked)} className="mt-0.5" data-testid="join-pan-consent" /><span>{hi ? 'मैं सहमत हूँ कि GENZ मेरा PAN सिर्फ़ KYC जाँचने के लिए रखे। 180 दिन तक KYC न करूँ तो PAN मिटा दिया जाएगा।' : 'I agree GENZ keeps my PAN only to check my KYC. If I do no KYC for 180 days it is deleted.'}</span></label>
                <p className="mt-1 text-[11px] text-slate-500">{hi ? 'आधार अभी नहीं चाहिए। RERA नहीं है? फिर भी आप Tier 2 एसोसिएट के रूप में वेरिफ़ाई हो सकते हैं; RERA बाद में जोड़ें तो GENZ जाँचकर मंज़ूर करे, तभी Tier 1 मिलेगा।' : 'No Aadhaar needed now. No RERA? You can still be verified as a Tier 2 associate; if you add RERA later, GENZ checks and approves it before you become Tier 1.'}</p></div>
            )}
            {role === 'GENZ_CONNECTOR' && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">{hi ? 'आप क्या करते हैं?' : 'What is your shop / role?'} *</label>
                    <select value={shopType} onChange={(e) => setShopType(e.target.value)} className={input}>{SHOP_TYPES.map(s => <option key={s.id} value={s.id}>{hi ? s.hi : s.label}</option>)}</select>
                  </div>
                  <div><label className="text-xs font-semibold text-slate-700">{hi ? 'दुकान / समूह का नाम' : 'Shop / group name'} *</label><input required value={shopName} onChange={(e) => setShopName(e.target.value)} className={input} /></div>
                </div>
                <div><label className="text-xs font-semibold text-slate-700">{hi ? 'UPI ID (इनाम पाने के लिए, बाद में भी जोड़ सकते हैं)' : 'UPI ID for rewards (can be added later)'}</label><input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okaxis" className={input} /></div>
              </>
            )}
            {tier2 && (
              <>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  {sponsorName && <p className="mb-1 font-semibold">{hi ? `आपको RERA-रजिस्टर्ड ब्रोकर ${sponsorName} ने रजिस्टर कराया है।` : `You are being registered by RERA-registered broker ${sponsorName}.`}</p>}
                  {hi ? 'आपका RERA नंबर ज़रूरी नहीं। आप लोकल एसोसिएट (Tier 2) के रूप में जुड़ेंगे; 30 दिन की प्रोबेशन रहेगी और बिल्डर प्रोजेक्ट RERA वेरिफिकेशन के बाद मिलेंगे। मंज़ूरी से पहले GENZ टीम आपका PAN और आधार कार्ड देखेगी।' : 'Your own RERA number is not required. You join as a Local Associate (Tier 2): 30-day probation, and builder projects open after RERA verification. Before approval the GENZ team will see your PAN and Aadhaar card.'}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><label className="text-xs font-semibold text-slate-700">{hi ? 'फ़र्म / ऑफ़िस का नाम' : 'Firm / office name'}{chip(company, pf?.companyName)}</label><input value={company} onChange={(e) => setCompany(e.target.value)} className={input} /></div>
                  <div><label className="text-xs font-semibold text-slate-700">RERA no. ({hi ? 'हो तो' : 'if you have one'})</label><input value={rera} onChange={(e) => setRera(e.target.value)} className={input + ' font-mono'} /></div>
                </div>
                <div><label className="text-xs font-semibold text-slate-700" htmlFor="join-pan-input">PAN *{chip(pan, pf?.panNumber)}</label><input id="join-pan-input" required maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().replace(/\s/g, ''))} className={input + ' font-mono'} aria-invalid={!!panIssue} />{panIssue && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{hi ? panIssue.hi : panIssue.en}</p>}</div>
              </>
            )}
            {needsRera && (
              <>
                <div><label className="text-xs font-semibold text-slate-700" htmlFor="join-company">{hi ? 'कंपनी / फ़र्म' : 'Company / firm'} {role === 'BROKER' ? (hi ? '(हो तो)' : '(if you have one)') : '*'}</label><input id="join-company" required={role !== 'BROKER'} value={company} onChange={(e) => setCompany(e.target.value)} className={input} /></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div><label className="text-xs font-semibold text-slate-700">RERA no. {role === 'BROKER' ? (hi ? '(हो तो)' : '(if you have one)') : '*'}</label><input required={role !== 'BROKER'} value={rera} onChange={(e) => setRera(e.target.value)} className={input + ' font-mono'} data-testid="join-rera" />
                    {role === 'BROKER' && <p className="mt-1 text-[11px] text-slate-500">{hi ? 'RERA के बिना भी जुड़ सकते हैं — “Non-RERA” बैज मिलेगा। बिल्डर / RERA प्रोजेक्ट में काम RERA नंबर जोड़ने के बाद खुलेगा।' : 'You can join without RERA — you get a “Non-RERA” badge. Builder / RERA projects open once you add your RERA number.'}</p>}</div>
                  <div><label className="text-xs font-semibold text-slate-700" htmlFor="join-pan-input">PAN *</label><input id="join-pan-input" required maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().replace(/\s/g, ''))} className={input + ' font-mono'} aria-invalid={!!panIssue} />{panIssue && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{hi ? panIssue.hi : panIssue.en}</p>}</div>
                  <div><label className="text-xs font-semibold text-slate-700" htmlFor="join-gstin">GSTIN {hi ? '(हो तो)' : '(if any)'}</label><input id="join-gstin" maxLength={15} value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} className={input + ' font-mono'} /></div>
                </div>
              </>
            )}

            {brokerId && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div><label className="text-xs font-semibold text-slate-700">{hi ? 'आधार नंबर (12 अंक)' : 'Aadhaar number (12 digits)'} *</label>
                  <input required inputMode="numeric" autoComplete="off" maxLength={14} value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/[^\d\s-]/g, ''))} placeholder="XXXX XXXX XXXX" className={input + ' font-mono tracking-wider'} aria-invalid={!!aadhaarIssue} />
                  {aadhaarIssue && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{hi ? aadhaarIssue.hi : aadhaarIssue.en}</p>}
                  {pf?.aadhaarLast4 && !aadhaarIssue && !last4Differs && <p className="mt-1 text-[11px] text-slate-600">{hi ? `आपके स्पॉन्सर ने आधार के आख़िरी 4 अंक ${pf.aadhaarLast4} बताए हैं — पूरा नंबर आप खुद डालें।` : `Your sponsor gave the last 4 Aadhaar digits as ${pf.aadhaarLast4} — please type the full number yourself.`}</p>}
                  {last4Differs && <p role="alert" className="mt-1 text-[11px] font-medium text-amber-800">{hi ? `आख़िरी 4 अंक स्पॉन्सर के बताए (${pf!.aadhaarLast4}) से मेल नहीं खाते। कार्ड से मिलाकर देखें; सही हों तो आगे बढ़ें — GENZ टीम इसे जाँचेगी।` : `The last 4 digits differ from what your sponsor gave (${pf!.aadhaarLast4}). Compare with the card; if yours is right, carry on — the GENZ team will look at it.`}</p>}
                  <p className="mt-1 text-[11px] text-slate-500">{hi ? AADHAAR_NOTE.hi : AADHAAR_NOTE.en}</p></div>
                <IdPhotoReader onApply={(v) => { if (v.pan) setPan(v.pan); if (v.aadhaar) setAadhaar(v.aadhaar); if (v.address) setAddress(v.address); if (v.pincode) setPincode(v.pincode); setFromPhoto(true); }} />
                <div><label className="text-xs font-semibold text-slate-700">{hi ? 'पता (जैसा आधार में है)' : 'Address (as on your Aadhaar)'}</label>
                  <textarea rows={3} maxLength={320} value={address} onChange={(e) => setAddress(e.target.value)} className={input} aria-invalid={!!addrIssue} data-testid="join-address" placeholder={hi ? 'मकान / गली, इलाक़ा, शहर' : 'House / street, area, city'} />
                  {addrIssue && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{hi ? addrIssue.hi : addrIssue.en}</p>}
                  <input inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} className={input + ' font-mono'} aria-invalid={!!pinIssue} data-testid="join-pin" placeholder={hi ? 'PIN कोड' : 'PIN code'} />
                  {pinIssue && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{hi ? pinIssue.hi : pinIssue.en}</p>}</div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">{hi ? 'PAN / आधार कार्ड की फ़ोटो (वैकल्पिक, पर मंज़ूरी जल्दी होती है)' : 'Photo of your PAN / Aadhaar card (optional — approval is quicker)'}</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(['PAN', 'AADHAAR'] as const).map(k => (
                      <IdDocSlot key={k} kind={k} pending={files[k]} onChoose={(p) => setFiles(x => ({ ...x, [k]: p }))} onClear={() => setFiles(x => ({ ...x, [k]: undefined }))}
                        note={pf?.docs.includes(k) && !files[k] ? (hi ? 'आपके स्पॉन्सर ने इसकी कॉपी पहले ही डाल दी है — चाहें तो नई डालें।' : 'Your sponsor has already added a copy — add a new one only if you want to.') : undefined} />
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">{hi ? ID_DOC_NOTE.hi : ID_DOC_NOTE.en}</p>
                </div>
                <label className="flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={idConsent} onChange={(e) => setIdConsent(e.target.checked)} className="mt-0.5" />
                  <span>{hi ? KYC_CONSENT.hi : KYC_CONSENT.en} {hi ? 'GENZ टीम मंज़ूरी से पहले मेरे मूल कार्ड देख सकती है।' : 'The GENZ team may ask to see my original cards before approval.'}</span>
                </label>
              </div>
            )}

            <div><label className="text-xs font-semibold text-slate-700">{hi ? 'पासवर्ड चुनें (10+ अक्षर, बड़ा, छोटा, अंक)' : 'Choose a password (10+ chars, upper, lower, number)'} *</label><input required type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} /></div>
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              <span>{hi ? 'मैं GENZ को अपना अकाउंट चलाने के लिए अपनी जानकारी इस्तेमाल करने की सहमति देता/देती हूँ।' : 'I agree to GENZ using my details to run my account.'}</span>
            </label>
            <details className="rounded-lg border border-slate-200 px-3 text-xs text-slate-600" data-testid="join-full-notice">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-slate-800">{hi ? 'पूरी सूचना पढ़ें' : 'Read full notice'}</summary>
              <p className="pb-2">{hi ? 'मैंने प्राइवेसी पॉलिसी और नियम पढ़ लिए हैं और डेटा के उपयोग की सहमति देता/देती हूँ।' : 'I have read the Privacy Policy and Terms and consent to the processing of my personal data.'} <a href="#/privacy" className="inline-flex min-h-11 items-center text-blue-700 underline" target="_blank" rel="noreferrer">{hi ? 'प्राइवेसी' : 'Privacy'}</a> · <a href="#/terms" className="inline-flex min-h-11 items-center text-blue-700 underline" target="_blank" rel="noreferrer">{hi ? 'नियम' : 'Terms'}</a></p>
            </details>
            {error && <p className="text-xs font-medium text-red-700">{error}</p>}
            <button disabled={busy || !consent} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" data-testid="join-submit">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {open ? (hi ? 'अकाउंट बनाएँ' : 'Create my account') : (hi ? 'आवेदन जमा करें' : 'Submit application')}</button>
          </form>
        )}
      </div>
    </div>
  );
};
