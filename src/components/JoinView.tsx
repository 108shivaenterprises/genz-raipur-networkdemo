import React, { useState } from 'react';
import { Loader2, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { LocationFields, LocationValue } from './LocationFields.js';
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
const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none';

/** Public sign-up with an invitation code (no login needed). The account then waits for admin KYC verification. */
export const JoinView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const [code, setCode] = useState('');
  const [inv, setInv] = useState<{ targetRole: string; invitedPhone: string; invitedEmail: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loc, setLoc] = useState<LocationValue>({ state: '', city: '', locality: '', pincode: '' });
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
  const [pf, setPf] = useState<{ name: string; city: string; companyName: string; panNumber: string; aadhaarLast4: string; docs: string[] } | null>(null);
  const [files, setFiles] = useState<{ PAN?: PreparedIdFile; AADHAAR?: PreparedIdFile }>({});
  const [autoVerified, setAutoVerified] = useState(false);
  const [uploadNote, setUploadNote] = useState('');

  const role = inv?.targetRole;
  const phoneOnly = !!inv?.invitedEmail?.endsWith('@phone.genz.local');
  const tier2 = !!(inv as any)?.tier2;
  const sponsorName: string = (inv as any)?.sponsorName || '';
  const needsRera = (role === 'BROKER' || role === 'DEVELOPER_BUILDER') && !tier2;
  // v18: every broker gives PAN + Aadhaar (only the last 4 digits are kept)
  const brokerId = role === 'BROKER';
  const aadhaarDigits = normAadhaar(aadhaar);
  const panIssue = panProblem(pan);
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
    if (brokerId) {
      if (!isValidPan(normPan(pan))) { const w = panProblem(pan); setError(w ? (hi ? w.hi : w.en) : (hi ? 'PAN डालें (जैसे ABCPD1234E)' : 'Enter your PAN (e.g. ABCPD1234E)')); return; }
      if (!isValidAadhaar(aadhaarDigits)) { const w = aadhaarProblem(aadhaarDigits); setError(w ? (hi ? w.hi : w.en) : (hi ? 'आधार नंबर डालें (12 अंक)' : 'Enter your Aadhaar number (12 digits)')); return; }
      if (addrIssue || pinIssue) { const w = addrIssue || pinIssue!; setError(hi ? w.hi : w.en); return; }
      if (!idConsent) { setError(hi ? 'PAN, आधार नंबर और पता रखने की सहमति दें' : 'Please agree to GENZ keeping your PAN, Aadhaar number and address'); return; }
    }
    setBusy(true);
    try {
      const reg = await api.registerInvite({
        code: code.trim(), name, phone, email: phoneOnly ? undefined : email, password, consent: true,
        state: loc.state || undefined, city: loc.city || undefined,
        ...(brokerId ? { aadhaarNumber: aadhaarDigits, idConsent: true, kycConsent: true, address: address ? normAddress(address) : undefined, pincode: pincode ? normPin(pincode) : undefined, kycSource: fromPhoto ? 'PHOTO' : 'TYPED' } : {}),
        ...(needsRera ? { companyName: company, reraNumber: rera, panNumber: normPan(pan) || undefined, gstin: gstin || undefined } : {}),
        ...(role === 'GENZ_CONNECTOR' ? { shopType, shopName, locality: loc.locality || undefined, payoutUpi: upi || undefined } : {}),
        ...(tier2 ? { companyName: company || undefined, reraNumber: rera || undefined, panNumber: normPan(pan) || undefined } : {}),
        ...(role !== 'GENZ_CONNECTOR' && !needsRera && !tier2 ? { companyName: company || undefined, panNumber: pan || undefined } : {}),
      } as any);
      // v19: the account exists now (and is signed in), so the chosen PAN / Aadhaar copies can go up; a failure here never undoes the registration
      const failed: string[] = [];
      for (const k of ['PAN', 'AADHAAR'] as const) { const f = files[k]; if (f) { try { await api.idMineUpload({ kind: k, fileName: f.fileName, data: f.data }); } catch (e: any) { failed.push(`${k}: ${e.message}`); } } }
      setUploadNote(failed.length ? (hi ? `आपका आवेदन जमा हो गया, पर एक कॉपी अपलोड नहीं हुई (${failed.join('; ')}). साइन-इन के बाद नेटवर्क → रजिस्टर और ID में दोबारा डालें।` : `Your application is in, but a copy was not uploaded (${failed.join('; ')}). After signing in add it under Network → Register & ID.`) : '');
      setAutoVerified(!!reg.autoVerified);
      setDone(phoneOnly ? `Sign in later with your mobile number ${phone}.` : `Sign in later with ${email}.`);
    } catch (err: any) { setError(err.message || 'Registration failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" /> {hi ? 'साइन इन पर वापस' : 'Back to sign in'}</button>
        <h1 className="flex items-center gap-2 text-base font-bold text-slate-900"><KeyRound className="h-4 w-4 text-amber-500" /> {hi ? 'आमंत्रण कोड से जुड़ें' : 'Join with your invitation code'}</h1>

        {done ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="mb-1 h-5 w-5 text-emerald-600" />
            <p className="font-semibold">{autoVerified ? (hi ? 'आप वेरिफ़ाइड हैं!' : 'You are verified!') : (hi ? 'आवेदन जमा हो गया!' : 'Application submitted!')}</p>
            <p className="mt-1 text-xs">{autoVerified
              ? (hi ? `RERA-रजिस्टर्ड ${sponsorName || 'ब्रोकर'} के ज़रिए आप तुरंत वेरिफ़ाई हो गए। GENZ टीम आपकी PAN / आधार ID बाद में देखेगी — ज़रूरत हो तो वह आपसे संपर्क करेगी।` : `You were verified straight away through RERA-registered ${sponsorName || 'your sponsor'}. The GENZ team will check your PAN / Aadhaar ID afterwards and will contact you if anything is needed.`)
              : (hi ? 'GENZ टीम आपके विवरण की जाँच करेगी। मंज़ूरी के बाद आप साइन इन कर पाएँगे।' : 'The GENZ team will verify your details. You can sign in once you are approved.')} {done}</p>
            {uploadNote && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{uploadNote}</p>}
            <button onClick={onBack} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white">{hi ? 'साइन इन पेज' : 'Go to sign in'}</button>
          </div>
        ) : !inv ? (
          <form onSubmit={check} className="mt-4">
            <p className="text-xs text-slate-500">{hi ? 'GENZ टीम से मिला कोड यहाँ डालें।' : 'Enter the code you received from the GENZ team.'}</p>
            <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="GZ-XXX-XXXXXXXXXXXX" className={input + ' font-mono tracking-wide'} />
            {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
            <button disabled={busy} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {hi ? 'कोड जाँचें' : 'Check code'}</button>
          </form>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{hi ? 'आप जुड़ रहे हैं:' : 'You are joining as:'} <b className="text-slate-900">{ROLE_LABEL[role!] || role}</b></p>
            {pf && <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">{hi ? `आपके स्पॉन्सर ${sponsorName || ''} ने आपकी कुछ जानकारी पहले से भर दी है। उसे देख लें और कुछ ग़लत हो तो सुधार दें।` : `Your sponsor${sponsorName ? ` ${sponsorName}` : ''} has already filled in some of your details. Please check them and correct anything that is wrong.`}</p>}
            <div><label className="text-xs font-semibold text-slate-700">{hi ? 'पूरा नाम' : 'Full name'} *{chip(name, pf?.name)}</label><input required value={name} onChange={(e) => setName(e.target.value)} className={input} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="text-xs font-semibold text-slate-700">{hi ? 'मोबाइल नंबर' : 'Mobile number'} *</label><input required value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="9XXXXXXXXX" className={input} /></div>
              {!phoneOnly && <div><label className="text-xs font-semibold text-slate-700">Email *</label><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} /></div>}
            </div>
            <LocationFields value={loc} onChange={setLoc} showLocality={role === 'GENZ_CONNECTOR'} showPincode={false} required={false} />

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
                <div><label className="text-xs font-semibold text-slate-700">PAN *{chip(pan, pf?.panNumber)}</label><input required maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().replace(/\s/g, ''))} className={input + ' font-mono'} aria-invalid={!!panIssue} />{panIssue && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{hi ? panIssue.hi : panIssue.en}</p>}</div>
              </>
            )}
            {needsRera && (
              <>
                <div><label className="text-xs font-semibold text-slate-700">Company / firm *</label><input required value={company} onChange={(e) => setCompany(e.target.value)} className={input} /></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div><label className="text-xs font-semibold text-slate-700">RERA no. *</label><input required value={rera} onChange={(e) => setRera(e.target.value)} className={input + ' font-mono'} /></div>
                  <div><label className="text-xs font-semibold text-slate-700">PAN *</label><input required maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().replace(/\s/g, ''))} className={input + ' font-mono'} aria-invalid={!!panIssue} />{panIssue && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{hi ? panIssue.hi : panIssue.en}</p>}</div>
                  <div><label className="text-xs font-semibold text-slate-700">GSTIN</label><input maxLength={15} value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} className={input + ' font-mono'} /></div>
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
              <span>{hi ? 'मैंने प्राइवेसी पॉलिसी और नियम पढ़ लिए हैं और डेटा के उपयोग की सहमति देता/देती हूँ।' : 'I have read the Privacy Policy and Terms and consent to the processing of my personal data.'} <a href="#/privacy" className="text-blue-700 underline" target="_blank" rel="noreferrer">Privacy</a> · <a href="#/terms" className="text-blue-700 underline" target="_blank" rel="noreferrer">Terms</a></span>
            </label>
            {error && <p className="text-xs font-medium text-red-700">{error}</p>}
            <button disabled={busy || !consent} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {hi ? 'आवेदन जमा करें' : 'Submit application'}</button>
          </form>
        )}
      </div>
    </div>
  );
};
