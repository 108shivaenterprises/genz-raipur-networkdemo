import React, { useState, useEffect } from 'react';
import { ShowMore } from './ShowMore.js';
import { LocationFields, LocationValue } from './LocationFields.js';
import { reraAuthorityOf } from '../shared/india.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { UserProfile, Invitation } from '../types/index.js';
import { api } from '../lib/api.js';
import { formatDate, formatINR } from '../lib/utils.js';
import { useUI } from '../lib/ui.js';
import { isValidIndianPhone, sanitizePhone, isValidPAN, isValidGSTIN } from '../lib/validate.js';
import {
  KeyRound,
  UserCheck,
  Building,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  ShieldCheck,
  Users,
  FileSearch,
} from 'lucide-react';
import { TrustScoreBadge } from './TrustScoreBadge.js';
import { AdminIdUpload } from './AdminIdUpload.js';

interface OnboardingViewProps {
  currentUser: UserProfile;
  users: UserProfile[];
  onRefreshUsers: () => void;
  /** v19: jump to the ID Review tab */
  onOpenIdReview?: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  currentUser,
  users,
  onRefreshUsers,
  onOpenIdReview,
}) => {
  const { t, lang } = useI18n();
  const tx = useTx();
  const label = useLabel();
  const { toast, confirm, prompt } = useUI();
  const [reraBusy, setReraBusy] = useState<string>('');   // v188: one RERA decision at a time per row
  const [openMode, setOpenMode] = useState(false);   // v188: sign-up is open (Basic accounts) vs invite-only
  useEffect(() => { api.authConfig().then(c => setOpenMode(c.signupMode !== 'invite')).catch(() => setOpenMode(false)); }, []);
  const [basicErr, setBasicErr] = useState<Record<string, string>>({});   // v188: why a Basic approval failed, kept in the row (a toast is gone in seconds)
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitedEmail, setInvitedEmail] = useState<string>('');
  const [invitedPhone, setInvitedPhone] = useState<string>('');
  const [targetRole, setTargetRole] = useState<string>('BROKER');
  const [lastInvite, setLastInvite] = useState<any>(null);
  const isSuperAdmin = currentUser.role === 'SUPERADMIN';
  const [isIssuingInvite, setIsIssuingInvite] = useState<boolean>(false);

  // Invite Redemption Form state
  const [redeemCode, setRedeemCode] = useState<string>('');
  const [applicantName, setApplicantName] = useState<string>('');
  const [applicantEmail, setApplicantEmail] = useState<string>('');
  const [applicantPhone, setApplicantPhone] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [reraNumber, setReraNumber] = useState<string>('');
  const [loc, setLoc] = useState<LocationValue>({ state: '', city: '', locality: '', pincode: '' });
  const [applicantPassword, setApplicantPassword] = useState<string>('');
  const [panNumber, setPanNumber] = useState<string>('');
  const [gstin, setGstin] = useState<string>('');
  const [consent, setConsent] = useState<boolean>(false);
  const [isRedeeming, setIsRedeeming] = useState<boolean>(false);
  const [redemptionSuccess, setRedemptionSuccess] = useState<string>('');

  const isAdmin = currentUser.role === 'SUPERADMIN' || currentUser.role === 'ADMIN';

  const fetchInvitations = async () => {
    if (isAdmin) {
      try {
        const res = await api.getInvitations();
        setInvitations(res.invitations || []);
      } catch (err) {
        console.error(err);
      }
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, [isAdmin]);

  const handleIssueInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitedPhone || (targetRole !== 'GENZ_CONNECTOR' && !invitedEmail)) return;
    if (!isValidIndianPhone(invitedPhone)) {
      toast(tx('Please enter a valid 10-digit Indian phone number', 'कृपया 10 अंकों का मान्य भारतीय मोबाइल नंबर दर्ज करें'), 'error');
      return;
    }
    setIsIssuingInvite(true);
    try {
      const res = await api.createInvitation({
        invitedEmail: invitedEmail || undefined,
        invitedPhone: sanitizePhone(invitedPhone),
        targetRole,
      });
      setLastInvite(res.invitation);
      setInvitedEmail('');
      setInvitedPhone('');
      toast(tx('Invitation sent successfully', 'निमंत्रण सफलतापूर्वक भेजा गया'), 'success');
      fetchInvitations();
    } catch (err: any) {
      toast(err.message || tx('Failed to send invitation', 'निमंत्रण भेजने में विफल'), 'error');
    } finally {
      setIsIssuingInvite(false);
    }
  };

  const handleRedeemInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (applicantPhone && !isValidIndianPhone(applicantPhone)) {
      toast(tx('Please enter a valid 10-digit Indian mobile number', 'कृपया 10 अंकों का मान्य भारतीय मोबाइल नंबर दर्ज करें'), 'error');
      return;
    }
    if (panNumber && !isValidPAN(panNumber)) {
      toast(tx('Please enter a valid PAN number (e.g. ABCDE1234F)', 'कृपया मान्य पैन नंबर दर्ज करें (उदा. ABCDE1234F)'), 'error');
      return;
    }
    if (gstin && !isValidGSTIN(gstin)) {
      toast(tx('Please enter a valid GSTIN (e.g. 22AAAAA0000A1Z5)', 'कृपया मान्य GSTIN दर्ज करें (उदा. 22AAAAA0000A1Z5)'), 'error');
      return;
    }
    setIsRedeeming(true);
    setRedemptionSuccess('');
    try {
      const res = await api.registerInvite({
        code: redeemCode,
        name: applicantName,
        email: applicantEmail,
        phone: sanitizePhone(applicantPhone),
        companyName,
        reraNumber,
        state: loc.state || undefined,
        city: loc.city || undefined,
        password: applicantPassword,
        panNumber: panNumber ? panNumber.toUpperCase().trim() : undefined,
        gstin: gstin ? gstin.toUpperCase().trim() : undefined,
        consent: true,
      });
      setRedemptionSuccess(
        `Application submitted successfully! Your account ID is ${res.user.id}. Awaiting admin document verification.`
      );
      toast(tx('Application submitted successfully! Awaiting verification.', 'आवेदन सफलतापूर्वक सबमिट हो गया! सत्यापन की प्रतीक्षा है।'), 'success');
      setRedeemCode('');
      setApplicantName('');
      setApplicantEmail('');
      setApplicantPhone('');
      setCompanyName('');
      setReraNumber('');
      setApplicantPassword('');
      setPanNumber(''); setGstin(''); setConsent(false);
      onRefreshUsers();
    } catch (err: any) {
      toast(err.message || tx('Application submission failed', 'आवेदन सबमिट करने में विफल'), 'error');
    } finally {
      setIsRedeeming(false);
    }
  };

  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');

  const filteredUsers = users.filter((u) => {
    if (userRoleFilter === 'BROKER') return u.role === 'BROKER';
    if (userRoleFilter === 'PENDING') return u.verificationStatus === 'PENDING';
    if (userRoleFilter === 'BASIC') return !!u.basicTier;
    if (userRoleFilter === 'BUILDER') return u.role === 'DEVELOPER_BUILDER';
    if (userRoleFilter === 'OWNER') return u.role === 'PROPERTY_OWNER';
    return true;
  });

  const handleReviewUser = async (userId: string, action: string) => {
    const basicRow = users.find(x => x.id === userId)?.basicTier;
    const ACT: Record<string, [string, string]> = { APPROVE: ['approve', 'मंज़ूर'], REJECT: ['reject', 'अस्वीकार'], SUSPEND: ['suspend', 'सस्पेंड'], BLACKLIST: ['blacklist', 'ब्लैकलिस्ट'] };
    const reason = await prompt(basicRow && action === 'APPROVE' ? tx('KYC checked — unlock this member. Note (what you checked):', 'KYC जाँच लिया — इस सदस्य को खोलें। नोट (क्या जाँचा):') : tx(`Note for this decision (${ACT[action]?.[0] || action.toLowerCase()}):`, `इस फ़ैसले का नोट (${ACT[action]?.[1] || action}):`), {
      confirmLabel: tx('Submit', 'सबमिट'),
      cancelLabel: tx('Cancel', 'रद्द करें'),
    });
    if (reason === null) return;
    try {
      // v186: approving a Basic account — show what it has waiting and ask before publishing (max 10 per approval)
      let publishIds: string[] = [];
      const tgt = users.find(x => x.id === userId);
      if (action === 'APPROVE' && tgt?.basicTier) {
        const h = await api.heldListings(userId).catch(() => null);
        if (h && h.total > 0) {
          // the admin reads each held listing and types the ids to publish (max 10); blank = keep all held
          const lines = h.listings.map(l => `${l.id} · ${l.propertyType || ''} ${l.transactionType || ''} · ${l.locality || ''}, ${l.city} · ${l.askingPrice != null ? formatINR(l.askingPrice) : '₹?'} · ${l.photos ?? 0} photo(s) · ${(l.description || '').slice(0, 120)}`).join('\n');
          const ans = await prompt(tx(`${tgt.name} has ${h.total} private listing(s):\n${lines}\nType the ids to publish now (comma separated, max 10). Leave blank to keep them all held.`, `${tgt.name} की ${h.total} निजी लिस्टिंग:\n${lines}\nअभी प्रकाशित करने वाली आईडी लिखें (कॉमा से, अधिकतम 10)। सब रोकने के लिए खाली छोड़ें।`), { confirmLabel: tx('Approve', 'मंज़ूर करें'), cancelLabel: tx('Cancel', 'रद्द करें') });
          if (ans === null) return;
          publishIds = ans.split(/[\s,]+/).map(x => x.trim()).filter(x => h.listings.some(l => l.id === x)).slice(0, 10);
        }
      }
      const res = await api.reviewVerification(userId, action, reason, publishIds);
      toast(tx(`User status updated to ${res.user.verificationStatus}. Broker ID: ${res.user.brokerId || 'N/A'}`, `यूज़र का स्टेटस ${res.user.verificationStatus} हो गया। ब्रोकर ID: ${res.user.brokerId || 'लागू नहीं'}`), 'success');
      setBasicErr(m => ({ ...m, [userId]: '' }));
      onRefreshUsers();
    } catch (err: any) {
      setBasicErr(m => ({ ...m, [userId]: err.message || '' }));
      if (!users.find(x => x.id === userId)?.basicTier) toast(err.message || tx('Failed to update status', 'स्टेटस अपडेट करने में विफल'), 'error');   // a Basic row shows the reason inline (once)
    }
  };

  /** v18 — the admin has seen the PAN card + Aadhaar card (video call / office); ticking again undoes it */
  const handleIdSeen = async (u: UserProfile) => {
    let note = '';
    if (!u.idCheckedAt) {
      const n = await prompt(tx('What did you see? (e.g. PAN card + masked Aadhaar on video call). Please do not write the numbers.', 'क्या देखा? (जैसे वीडियो कॉल पर PAN कार्ड + मास्क्ड आधार)। नंबर न लिखें।'), {
        confirmLabel: tx('Submit', 'सबमिट'),
        cancelLabel: tx('Cancel', 'रद्द करें'),
      });
      if (n === null) return;
      note = n;
    }
    try {
      await api.netIdCheck(u.id, !u.idCheckedAt, note);
      toast(tx(u.idCheckedAt ? 'ID check removed' : 'ID check verified', u.idCheckedAt ? 'ID जाँच हटाई गई' : 'ID जाँच सत्यापित की गई'), 'info');
      onRefreshUsers();
    } catch (err: any) {
      toast(err.message || tx('Failed to update ID check', 'ID जाँच अपडेट करने में विफल'), 'error');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{tx('Controlled Onboarding Protocol', 'नियंत्रित ऑनबोर्डिंग प्रक्रिया')}</span>
          <span aria-hidden="true">·</span>
          <span>{tx('RERA & KYC Compliance', 'RERA और KYC अनुपालन')}</span>
        </div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 mt-1">
          {openMode ? tx('Onboarding & Broker Verification Desk', 'ऑनबोर्डिंग और ब्रोकर वेरिफ़िकेशन डेस्क') : tx('Invite-Only Onboarding & Broker Verification Desk', 'सिर्फ़ इनवाइट से ऑनबोर्डिंग और ब्रोकर वेरिफ़िकेशन डेस्क')}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {tx('GENZ BUILDCON enforces verified onboarding. Approved brokers receive permanent Broker IDs (e.g. GZ-BRK-XXXXX) backed by state RERA credentials.', 'GENZ BUILDCON वेरिफ़ाइड ऑनबोर्डिंग ही रखता है। मंज़ूर ब्रोकर को राज्य के RERA प्रमाणपत्र पर आधारित स्थायी ब्रोकर ID (जैसे GZ-BRK-XXXXX) मिलती है।')}
        </p>
        {isAdmin && onOpenIdReview && (
          <button onClick={onOpenIdReview} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 text-xs font-semibold text-violet-900">
            <FileSearch className="h-4 w-4" />{tx('Open ID Review — PAN / Aadhaar copies, assign a checker, auto-verify switch', 'ID जाँच खोलें — PAN / आधार कॉपी, जाँचने वाला तय करें, ऑटो-वेरिफ़ाई स्विच')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Box 1: how new members join (public page — no login needed) */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-500" />
            <h3 className="text-base font-bold text-slate-900">{tx('How new members join', 'नए सदस्य कैसे जुड़ते हैं')}</h3>
          </div>
          <details className="text-xs" data-testid="howto-toggle"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-slate-700">{tx('How this works', 'यह कैसे काम करता है')}</summary><ol className="list-decimal pl-5 text-xs text-slate-600 space-y-1.5">
            <li>{tx('Issue a single-use invitation code here (right side).', 'यहाँ (दाईं तरफ़) एक बार चलने वाला इनवाइट कोड बनाएँ।')}</li>
            <li>{lang === 'hi' ? <>कोड WhatsApp पर भेजें। सदस्य ऐप खोलकर साइन-इन पेज पर <b>“आमंत्रण कोड है? यहाँ जुड़ें”</b> दबाता है और फ़ॉर्म भरता है — लॉगिन की ज़रूरत नहीं।</> : <>Send the code on WhatsApp. The member opens the app, taps <b>“Have an invitation code? Join here”</b> on the sign-in page and fills the form — no login needed.</>}</li>
            {openMode && <li>{tx('Open sign-up is ON: anyone can join by phone code and goes live at once in Basic (not KYC verified). Check their KYC under the “Basic” filter below and unlock them.', 'ओपन साइन-अप चालू है: कोई भी फ़ोन कोड से जुड़ सकता है और तुरंत बेसिक में लाइव हो जाता है (KYC नहीं)। नीचे “बेसिक” फ़िल्टर में उनका KYC जाँचकर उन्हें खोलें।')}</li>}
            <li>{tx(openMode ? 'Invite applications appear in the verification queue below. Check KYC and approve — only then can they sign in.' : 'The application appears in the verification queue below. Check KYC and approve — only then can they sign in.', 'आवेदन नीचे वेरिफ़िकेशन कतार में दिखेगा। KYC जाँचकर मंज़ूर करें — तभी वे साइन-इन कर पाएँगे।')}</li>
          </ol></details>
          {lastInvite && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-2">
              <div>{tx('Last invitation code', 'आख़िरी इनवाइट कोड')}: <b className="font-mono">{lastInvite.code}</b> ({lastInvite.targetRole})</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => navigator.clipboard?.writeText(lastInvite.code)} className="rounded-md bg-white px-2.5 py-1 font-semibold border border-emerald-300">{tx('Copy code', 'कोड कॉपी करें')}</button>
                <a target="_blank" rel="noreferrer" className="rounded-md bg-emerald-600 px-2.5 py-1 font-semibold text-white"
                  href={`https://wa.me/91${(lastInvite.invitedPhone || '').replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`GENZ Broker Network invitation\nCode: ${lastInvite.code}\nOpen ${window.location.origin} → "Have an invitation code? Join here". Valid for 14 days.`)}`}>
                  {tx('Send on WhatsApp', 'WhatsApp पर भेजें')}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Box 2: Issue Invitation Form (Admin Only) */}
        {isAdmin ? (
          <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">
                {tx('Issue Single-Use Invitation (Admin Desk)', 'एक बार वाला इनवाइट बनाएँ (एडमिन डेस्क)')}
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              {tx('Only GENZ administrators can authorize new brokers or contractors to enter the private collaboration exchange.', 'सिर्फ़ GENZ एडमिन ही नए ब्रोकर या कॉन्ट्रैक्टर को इस निजी एक्सचेंज में आने की मंज़ूरी दे सकते हैं।')}
            </p>

            <form onSubmit={handleIssueInvite} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Target Role', 'किस भूमिका के लिए')}:</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                >
                  <option value="BROKER">{tx('BROKER (Real Estate Partner)', 'ब्रोकर (रियल एस्टेट पार्टनर)')}</option>
                  <option value="GENZ_CONNECTOR">{tx('GENZ CONNECTOR (shopkeeper / community partner)', 'GENZ कनेक्टर (दुकानदार / कम्युनिटी पार्टनर)')}</option>
                  <option value="PROPERTY_OWNER">{tx('PROPERTY OWNER', 'प्रॉपर्टी ओनर')}</option>
                  <option value="BUYER_TENANT">{tx('BUYER / TENANT', 'खरीदार / किरायेदार')}</option>
                  <option value="CONTRACTOR">{tx('CONTRACTOR (GENZ BUILDCON Partner)', 'कॉन्ट्रैक्टर (GENZ BUILDCON पार्टनर)')}</option>
                  <option value="DEVELOPER_BUILDER">{tx('DEVELOPER / BUILDER', 'डेवलपर / बिल्डर')}</option>
                  {isSuperAdmin && <option value="ADMIN">{tx('ADMIN (operations desk)', 'एडमिन (ऑपरेशंस डेस्क)')}</option>}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Invitee Email{targetRole === 'GENZ_CONNECTOR' ? ' (optional — connectors can sign in with their mobile number)' : ''}:</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={invitedEmail}
                  onChange={(e) => setInvitedEmail(e.target.value)}
                  required={targetRole !== 'GENZ_CONNECTOR'}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Invitee Mobile Phone', 'जिसे बुलाना है उसका मोबाइल')}:</label>
                <input
                  type="text"
                  placeholder="+91 98261 55667"
                  value={invitedPhone}
                  onChange={(e) => setInvitedPhone(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={isIssuingInvite}
                className="w-full mt-2 rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-amber-300 hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {isIssuingInvite ? tx('Generating...', 'बन रहा है...') : tx('Issue Invitation Code', 'इनवाइट कोड बनाएँ')}
              </button>
            </form>

            {/* Recent Invitations */}
            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500 mb-2">{tx('Recent Issued Codes', 'हाल में बने कोड')}:</div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-200/60"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900">{inv.code}</span>
                      <span className="text-slate-500 text-[11px] ml-2">({inv.targetRole})</span>
                    </div>
                    <span
                      className={`text-[11px] font-medium ${
                        inv.status === 'PENDING'
                          ? 'text-amber-700'
                          : inv.status === 'REDEEMED'
                          ? 'text-emerald-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {label('status', inv.status)}
                      {inv.status === 'PENDING' && (
                        <button
                          onClick={async () => {
                            const ok = await confirm(
                              tx('Revoke Invitation', 'निमंत्रण रद्द करें'),
                              tx('Are you sure you want to revoke this invitation?', 'क्या आप वाकई इस निमंत्रण को रद्द करना चाहते हैं?'),
                              { danger: true, confirmLabel: tx('Revoke', 'रद्द करें'), cancelLabel: tx('Cancel', 'रद्द करें') }
                            );
                            if (!ok) return;
                            try {
                              await api.revokeInvitation(inv.id);
                              toast(tx('Invitation revoked', 'निमंत्रण रद्द किया गया'), 'info');
                              fetchInvitations();
                            } catch (err: any) {
                              toast(err.message || tx('Failed to revoke invitation', 'निमंत्रण रद्द करने में विफल'), 'error');
                            }
                          }}
                          className="ml-2 text-red-600 hover:underline"
                        >
                          {tx('Revoke', 'रद्द करें')}
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs flex flex-col justify-center items-center text-center text-xs text-slate-500 space-y-2">
            <ShieldCheck className="h-8 w-8 text-emerald-600" />
            <h4 className="font-bold text-slate-900 text-sm">{tx('Verified Network Security', 'वेरिफ़ाइड नेटवर्क सुरक्षा')}</h4>
            <p className="max-w-xs leading-relaxed">
              {tx('New broker registrations require administrator authorization. Invitations and KYC approvals are handled by the GENZ admin desk.', 'नए ब्रोकर का रजिस्ट्रेशन एडमिन की मंज़ूरी से होता है। इनवाइट और KYC मंज़ूरी GENZ एडमिन डेस्क संभालता है।')}
            </p>
          </div>
        )}
      </div>

      {/* Admin Verification Review Table */}
      {isAdmin && (
        <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-700" />
              <h3 className="text-base font-bold text-slate-900">
                {tx('Network Participants, Trust Scores & KYC Verification Review', 'नेटवर्क सदस्य, ट्रस्ट स्कोर और KYC वेरिफ़िकेशन समीक्षा')}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{filteredUsers.length} of {users.length} profiles</span>
            </div>
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3 text-xs">
            <button
              onClick={() => setUserRoleFilter('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                userRoleFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tx('All participants', 'सभी सदस्य')} ({users.length})
            </button>
            <button
              onClick={() => setUserRoleFilter('BROKER')}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                userRoleFilter === 'BROKER'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <span>{tx('Brokers', 'ब्रोकर')} ({users.filter(u => u.role === 'BROKER').length})</span>
            </button>
            <button
              onClick={() => setUserRoleFilter('PENDING')}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                userRoleFilter === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span>{tx('Pending KYC', 'KYC बाकी')} ({users.filter(u => u.verificationStatus === 'PENDING').length})</span>
            </button>
            <button
              onClick={() => setUserRoleFilter('BASIC')} data-testid="basic-filter"
              className={`max-sm:order-first flex min-h-11 items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${userRoleFilter === 'BASIC' ? 'bg-sky-700 text-white shadow-xs' : 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'}`}
            >
              <span>{tx('New auto-live (Basic)', 'नए ऑटो-लाइव (बेसिक)')} ({users.filter(u => u.basicTier).length})</span>
            </button>
            <button
              onClick={() => setUserRoleFilter('BUILDER')}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                userRoleFilter === 'BUILDER'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100'
              }`}
            >
              <span>{tx('Developers & builders', 'डेवलपर और बिल्डर')} ({users.filter(u => u.role === 'DEVELOPER_BUILDER').length})</span>
            </button>
            <button
              onClick={() => setUserRoleFilter('OWNER')}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                userRoleFilter === 'OWNER'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
              }`}
            >
              <span>{tx('Property owners', 'प्रॉपर्टी मालिक')} ({users.filter(u => u.role === 'PROPERTY_OWNER').length})</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs max-sm:block">
              <thead className="max-sm:hidden bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3">{tx('User & Organization', 'यूज़र और संस्था')}</th>
                  <th className="px-4 py-3">{tx('Role & Broker ID', 'भूमिका और ब्रोकर ID')}</th>
                  <th className="px-4 py-3">{tx('Trust Score & Tier', 'ट्रस्ट स्कोर और टियर')}</th>
                  <th className="px-4 py-3">{tx('RERA Registration', 'RERA पंजीकरण')}</th>
                  <th className="px-4 py-3">{tx('Contact', 'संपर्क')}</th>
                  <th className="px-4 py-3">{tx('Verification Status', 'वेरिफ़िकेशन स्टेटस')}</th>
                  <th className="px-4 py-3 text-right">{tx('Admin Action', 'एडमिन कार्रवाई')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 max-sm:block">
                <ShowMore step={10} cols={12}>{filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 max-sm:block max-sm:py-2">
                    <td className="max-sm:block max-sm:px-3 max-sm:py-1 px-4 py-3">
                      <div className="font-bold text-slate-900">{u.name}</div>
                      <div className="text-[11px] text-slate-500">{u.companyName || 'Independent'}</div>
                    </td>
                    <td className="max-sm:block max-sm:px-3 max-sm:py-1 px-4 py-3">
                      <span className="font-semibold text-slate-800">{u.role}</span>
                      {u.brokerId && (
                        <div className="font-mono text-emerald-700 font-bold text-[11px]">
                          {u.brokerId}
                        </div>
                      )}
                    </td>
                    <td className="max-sm:block max-sm:px-3 max-sm:py-1 px-4 py-3">
                      {u.role === 'BROKER' ? (
                        <TrustScoreBadge user={u} variant="pill" />
                      ) : (
                        <span className="text-[11px] text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="max-sm:block max-sm:px-3 max-sm:py-1 px-4 py-3 font-mono text-slate-600">
                      {u.reraNumber ? (
                        <a href="https://rera.gov.in" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted" title={`Verify with ${reraAuthorityOf(u.state)}`}>{u.reraNumber}</a>
                      ) : '—'}
                      {isAdmin && (u.panNumber || u.gstin) && (
                        <div className="text-[10px] text-slate-500">{u.panNumber && `PAN ${u.panNumber}`}{u.gstin && ` · GST ${u.gstin}`}</div>
                      )}
                      {isAdmin && u.role === 'BROKER' && (
                        <div className="mt-0.5 space-y-0.5 font-sans text-[10px] text-slate-500">
                          <div>{tx('Aadhaar', 'आधार')}: {u.aadhaarLast4 ? `XXXX XXXX ${u.aadhaarLast4}` : <span className="text-red-700">{tx('not given', 'नहीं दिया')}</span>}</div>
                          {u.sponsorId && <div>{tx('Registered by', 'रजिस्टर कराया')}: <b>{users.find(x => x.id === u.sponsorId)?.name || u.sponsorId}</b></div>}
                          <div className={u.idCheckedAt ? 'font-semibold text-emerald-700' : 'text-amber-700'}>{u.idCheckedAt ? `✓ ${tx('ID seen by GENZ', 'ID GENZ ने देखी')}` : tx('ID not yet seen', 'ID देखी नहीं')}</div>
                        </div>
                      )}
                    </td>
                    <td className="max-sm:block max-sm:px-3 max-sm:py-1 px-4 py-3 text-slate-600">
                      <div>{u.phone}</div>
                      <div className="text-[11px] text-slate-500">{/@phone\.genz\.local$/i.test(u.email || '') ? (u.phone || '') : u.email}</div>
                    </td>
                    <td className="max-sm:block max-sm:px-3 max-sm:py-1 px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          u.verificationStatus === 'VERIFIED' && !u.basicTier
                            ? 'text-emerald-700'
                            : u.verificationStatus === 'BLACKLISTED'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {u.verificationStatus === 'VERIFIED' && <CheckCircle2 className="h-3 w-3" />}
                        {u.verificationStatus === 'BLACKLISTED' && <AlertTriangle className="h-3 w-3" />}
                        {u.basicTier && u.verificationStatus === 'VERIFIED' ? tx('Basic (not KYC verified)', 'बेसिक (KYC नहीं)') : u.verificationStatus}
                      </span>
                    </td>
                    <td className="max-sm:block max-sm:px-3 max-sm:py-1 px-4 py-3 text-right space-x-1">
                      {u.verificationStatus === 'PENDING' && (
                        <>
                          {u.role === 'BROKER' && u.panNumber && u.aadhaarLast4 && (
                            <button
                              onClick={() => handleIdSeen(u)}
                              className={`rounded border px-2 py-1 text-[11px] font-semibold ${u.idCheckedAt ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
                            >
                              {u.idCheckedAt ? tx('✓ ID seen (undo)', '✓ ID देखी (हटाएँ)') : tx('I have seen the ID', 'मैंने ID देख ली')}
                            </button>
                          )}
                          <button
                            onClick={() => handleReviewUser(u.id, 'APPROVE')}
                            disabled={u.role === 'BROKER' && u.tier === 'TIER2' && !u.idCheckedAt}
                            title={u.role === 'BROKER' && u.tier === 'TIER2' && !u.idCheckedAt ? tx('A local associate (no RERA) needs PAN + Aadhaar on file and "ID seen" first', 'लोकल एसोसिएट (बिना RERA) के लिए पहले PAN + आधार दर्ज और "ID देखी" ज़रूरी') : undefined}
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {tx('Approve & Assign ID', 'मंज़ूर करें और ID दें')}
                          </button>
                          <button
                            onClick={() => handleReviewUser(u.id, 'REJECT')}
                            className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                          >
                            {tx('Reject', 'अस्वीकार करें')}
                          </button>
                        </>
                      )}
                      {u.basicTier && u.verificationStatus === 'VERIFIED' && u.id !== currentUser.id && (
                        <>
                          {(u.role === 'BROKER' ? !!(u.panNumber || u.aadhaarLast4 || u.reraClaim) : true) && (
                            <button onClick={() => handleIdSeen(u)} className={`min-h-11 rounded border px-2 py-1 text-[11px] font-semibold ${u.idCheckedAt ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`} data-testid="basic-id-seen">{u.idCheckedAt ? tx('✓ ID seen (undo)', '✓ ID देखी (हटाएँ)') : tx('I have seen the ID', 'मैंने ID देख ली')}</button>
                          )}
                          <button onClick={() => handleReviewUser(u.id, 'APPROVE')} disabled={!u.idCheckedAt} title={!u.idCheckedAt ? tx('Tick “I have seen the ID” first', 'पहले “मैंने ID देख ली” दबाएँ') : undefined} className="min-h-11 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40" data-testid="basic-approve">{u.role !== 'BROKER' ? tx('KYC verified — unlock', 'KYC सही — खोलें') : (u.reraClaim?.status === 'APPROVED' && u.reraClaim.decidedBy && u.reraClaim.decidedBy !== 'AUTO') ? tx('Approve (Tier 1 — RERA verified)', 'मंज़ूर (Tier 1 — RERA वेरिफ़ाइड)') : tx('Approve (Tier 2 — no RERA)', 'मंज़ूर (Tier 2 — बिना RERA)')}</button>
                          <button onClick={() => handleReviewUser(u.id, 'SUSPEND')} className="min-h-11 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100" data-testid="basic-suspend">{tx('Suspend', 'सस्पेंड करें')}</button>
                          <div className="mt-2 space-y-1.5 text-left" data-testid="basic-row-extra">
                            {!u.idCheckedAt && <p className="text-[11px] text-amber-800" data-testid="basic-approve-why">{tx('Approve opens after you tick “I have seen the ID” (PAN or a card copy is enough).', '“मैंने ID देख ली” दबाने के बाद ही मंज़ूर होगा (PAN या कार्ड की कॉपी काफ़ी है)।')}</p>}
                            {u.reraClaim && (
                              <div className="rounded border border-sky-200 bg-sky-50 p-2 text-[11px] text-sky-900">
                                <b>{tx('RERA claim', 'RERA दावा')}:</b> <span className="font-mono">{u.reraClaim.number}</span> · {u.reraClaim.status === 'PENDING' ? tx('waiting for you', 'आपके फ़ैसले का इंतज़ार') : u.reraClaim.status === 'APPROVED' ? tx('approved', 'मंज़ूर') : tx('not accepted', 'मंज़ूर नहीं')}
                                {u.reraClaim.status === 'PENDING' && (
                                  <span className="ml-2 inline-flex gap-1.5">
                                    <button className="min-h-11 rounded bg-sky-700 px-2 font-semibold text-white disabled:opacity-50" data-testid="basic-rera-approve" disabled={reraBusy === u.id} onClick={async () => { setReraBusy(u.id); try { await api.netReraDecide(u.id, true); toast(tx('RERA approved', 'RERA मंज़ूर'), 'info'); setBasicErr(m => ({ ...m, [u.id]: '' })); onRefreshUsers(); } catch (e: any) { toast(e.message, 'error'); } finally { setReraBusy(''); } }}>{tx('Approve RERA', 'RERA मंज़ूर करें')}</button>
                                    <button className="min-h-11 rounded border border-slate-300 bg-white px-2 font-semibold text-slate-700 disabled:opacity-50" disabled={reraBusy === u.id} onClick={async () => { const n = await prompt(tx('Why can the RERA not be accepted? (at least 5 characters — the member sees this)', 'RERA क्यों मंज़ूर नहीं हो सकता? (कम से कम 5 अक्षर — सदस्य यह देखेगा)'), { confirmLabel: tx('Submit', 'सबमिट'), cancelLabel: tx('Cancel', 'रद्द करें') }); if (n === null) return; if (n.trim().length < 5) { toast(tx('Write the reason (at least 5 characters)', 'कारण लिखें (कम से कम 5 अक्षर)'), 'error'); return; } setReraBusy(u.id); try { await api.netReraDecide(u.id, false, n.trim()); toast(tx('RERA marked not accepted — the member is told', 'RERA मंज़ूर नहीं किया — सदस्य को बता दिया'), 'info'); onRefreshUsers(); } catch (e: any) { toast(e.message, 'error'); } finally { setReraBusy(''); } }}>{tx('Not accepted', 'मंज़ूर नहीं')}</button>
                                  </span>
                                )}
                              </div>
                            )}
                            {basicErr[u.id] && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-800" data-testid="basic-approve-error">{basicErr[u.id]}</p>}
                            <AdminIdUpload userId={u.id} onDone={onRefreshUsers} />
                          </div>
                        </>
                      )}
                      {u.verificationStatus === 'VERIFIED' && isSuperAdmin && u.role !== 'SUPERADMIN' && u.id !== currentUser.id && (
                        <button
                          onClick={() => handleReviewUser(u.id, 'BLACKLIST')}
                          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                        >
                          {tx('Blacklist', 'ब्लैकलिस्ट करें')}
                        </button>
                      )}
                      {u.verificationStatus === 'BLACKLISTED' && (
                        <button
                          onClick={() => handleReviewUser(u.id, 'APPROVE')}
                          className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                        >
                          {tx('Reinstate', 'बहाल करें')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}</ShowMore>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
