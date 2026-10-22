import { ProtectionPicker } from './ProtectionDays.js';
import React, { useMemo, useState } from 'react';
import { ShieldCheck, Lock, X, CheckCircle2, Clock, AlertTriangle, UserCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatINR, formatDateTime } from '../lib/utils.js';
import { useI18n } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import type { OwnerMandate, Property, UserProfile } from '../types/index.js';

interface Props {
  property: Property;
  mandates: OwnerMandate[];
  currentUser: UserProfile;
  brokers: UserProfile[];
  onClose: () => void;
  onChanged: () => void;
  /** v27 — a broker-made listing has no owner login: open the owner-consent drafts at this draft */
  onOpenDrafts?: (draftId: string) => void;
}

const STATUS_STYLE: Record<OwnerMandate['status'], string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  PENDING_BROKER: 'bg-amber-100 text-amber-900 border-amber-300',
  REJECTED: 'bg-red-100 text-red-900 border-red-300',
  WITHDRAWN: 'bg-slate-100 text-slate-700 border-slate-300',
  SUPERSEDED: 'bg-slate-100 text-slate-500 border-slate-200',
};

/**
 * Owner ⇄ listing-broker mandate.
 * The owner states the FIXED FINAL (net) amount he must receive; whatever the property finally sells for
 * above that amount belongs to the listing broker. Owner signs when submitting, the listing broker co-signs.
 */
export const MandateModal: React.FC<Props> = ({ property, mandates, currentUser, brokers, onClose, onChanged, onOpenDrafts }) => {
  const { lang, t } = useI18n();
  const hi = lang === 'hi';
  const label = useLabel();
  const isOwner = currentUser.role === 'PROPERTY_OWNER' && property.ownerId === currentUser.id;
  const isListingBroker = currentUser.role === 'BROKER' && property.listingBrokerId === currentUser.id;

  const mine = useMemo(
    () => mandates.filter((m) => m.propertyId === property.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [mandates, property.id]
  );
  const pending = mine.find((m) => m.status === 'PENDING_BROKER');
  const active = mine.find((m) => m.status === 'ACTIVE');

  const [advertised, setAdvertised] = useState<string>(String(property.askingPrice || ''));
  const [net, setNet] = useState<string>(String(active?.approvedNetPrice || property.ownerApprovedNetPrice || ''));
  const [basis, setBasis] = useState<OwnerMandate['remunerationBasis']>('SURPLUS_ABOVE_NET');
  const [pct, setPct] = useState<string>('2');
  const [fee, setFee] = useState<string>('');
  const [days, setDays] = useState<string>(String(active?.protectionPeriodDays || 30));
  const [password, setPassword] = useState('');
  const [declineNote, setDeclineNote] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [brokerPick, setBrokerPick] = useState('');
  const [showForm, setShowForm] = useState(!pending && !active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const startOwnerSign = async () => {
    setBusy(true); setError('');
    try { const r = await api.consentFromProperty(property.id); onOpenDrafts?.(r.draft.id); }
    catch (e: any) { setError(e.message || 'Error'); } finally { setBusy(false); }
  };

  const adv = Number(advertised);
  const netN = Number(net);
  const pctN = Number(pct);
  const feeN = Number(fee);
  const brokerAtAsking = basis === 'PERCENTAGE' ? Math.round((adv * (pctN || 0)) / 100) : basis === 'FIXED_FEE' ? (feeN || 0) : Math.max(0, adv - (netN || 0));
  const ownerGets = Math.max(0, adv - brokerAtAsking);
  const surplusPct = adv > 0 ? (brokerAtAsking / adv) * 100 : 0;
  // the broker list is empty on some screens (Owners board): fall back to the name the server sends with the mandate, never a bare ID
  const brokerName = brokers.find((b) => b.id === property.listingBrokerId)?.name
    || mandates.find((m) => m.propertyId === property.id && m.brokerName)?.brokerName
    || (property.listingBrokerId === currentUser.id ? currentUser.name : (hi ? 'लिस्टिंग ब्रोकर' : 'Listing broker'));

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true); setError(''); setDone('');
    try {
      await fn();
      setDone(okMsg);
      setPassword('');
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (basis === 'SURPLUS_ABOVE_NET') {
      if (!(netN > 0)) return setError(hi ? 'अपनी फिक्स्ड नेट रकम लिखें' : 'Enter your fixed net amount');
      if (netN > adv) return setError(hi ? 'नेट रकम विज्ञापित कीमत से ज़्यादा नहीं हो सकती' : 'The net amount cannot be higher than the advertised price');
    } else if (basis === 'PERCENTAGE') {
      if (!(pctN >= 0.1 && pctN <= 10)) return setError(hi ? 'कमीशन 0.1% से 10% के बीच होना चाहिए' : 'Commission must be between 0.1% and 10%');
    } else if (!(feeN > 0 && feeN < adv)) {
      return setError(hi ? 'फिक्स्ड ब्रोकरेज विज्ञापित कीमत से कम और शून्य से ज़्यादा होनी चाहिए' : 'Fixed brokerage must be above 0 and below the advertised price');
    }
    void run(
      async () => {
        await api.createOwnerMandate({
          propertyId: property.id, remunerationBasis: basis, advertisedPrice: adv, protectionPeriodDays: Number(days) || 30, password,
          ...(basis === 'SURPLUS_ABOVE_NET' ? { approvedNetPrice: netN } : basis === 'PERCENTAGE' ? { commissionPct: pctN } : { fixedFeeAmount: feeN }),
        });
        setShowForm(false);
      },
      hi ? 'मैंडेट आपके हस्ताक्षर के साथ लिस्टिंग ब्रोकर को भेज दिया गया।' : 'Mandate signed by you and sent to the listing broker for co-signing.'
    );
  };

  const pwField = (
    <div>
      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
        <Lock className="h-3 w-3" /> {hi ? 'हस्ताक्षर के लिए अपना पासवर्ड' : 'Your password (acts as your e-signature)'}
      </label>
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-slate-900 focus:outline-none"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl my-6">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-900">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              {hi ? 'ब्रोकरेज मैंडेट — मालिक ⇄ लिस्टिंग ब्रोकर' : 'Brokerage Mandate — Owner ⇄ Listing Broker'}
            </h3>
            <p className="text-xs text-slate-500">{property.id} · {property.title} · {property.locality}, {property.city}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={hi ? 'बंद करें' : 'Close'}><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-950">
          {hi
            ? <>लिस्टिंग ब्रोकर को भुगतान <strong>तीन तरीक़ों</strong> में से एक से तय होता है: <strong>नेट अमाउंट</strong> (नेट से ऊपर की रकम ब्रोकर की), <strong>कमीशन %</strong> (फ़ाइनल कीमत का %), या <strong>फिक्स्ड फ़ीस</strong> (तय रकम)। ये शर्तें सिर्फ़ मालिक, लिस्टिंग ब्रोकर और एडमिन को दिखती हैं।</>
            : <>The listing broker is paid in <strong>one of three ways</strong>: <strong>Net amount</strong> (everything above the owner's net is the broker's), <strong>Commission %</strong> (of the final price), or a <strong>Fixed fee</strong> (flat ₹). These terms are visible only to the owner, the listing broker and platform admins.</>}
        </div>

        {error && <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}</div>}
        {done && <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />{done}</div>}

        {/* ── No listing broker yet (owner) ── */}
        {isOwner && !property.listingBrokerId && (
          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-800">{hi ? 'पहले अपना लिस्टिंग ब्रोकर चुनें' : 'First choose your listing broker'}</div>
            <select value={brokerPick} onChange={(e) => setBrokerPick(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-xs">
              <option value="">{hi ? '— सत्यापित ब्रोकर —' : '— Verified broker —'}</option>
              {brokers.filter((b) => b.verificationStatus === 'VERIFIED').map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.companyName ? ` — ${b.companyName}` : ''}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!brokerPick || busy}
              onClick={() => run(() => api.appointListingBroker(property.id, brokerPick), hi ? 'लिस्टिंग ब्रोकर नियुक्त हुआ।' : 'Listing broker appointed.')}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {hi ? 'नियुक्त करें' : 'Appoint'}
            </button>
          </div>
        )}

        {/* ── v27: the listing broker, listing made by the broker (the owner is not on GENZ) ── */}
        {isListingBroker && !property.ownerId && !pending && !active && (
          <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50/60 p-3 text-xs" data-testid="mandate-broker-start">
            <p className="font-semibold text-purple-950">{hi ? 'इस लिस्टिंग पर अभी मालिक का साइन और ब्रोकरेज तय नहीं है।' : 'This listing has no owner signature and no brokerage terms yet.'}</p>
            <p className="mt-1 text-slate-700">{hi ? 'मालिक GENZ पर नहीं है, इसलिए आप ब्रोकरेज (नेट / कमीशन % / फिक्स्ड) यहीं तय करते हैं और मालिक WhatsApp लिंक पर पढ़कर अपने साइन (नाम के अक्षर या हाथ का साइन) से मान लेता है। मालिक की हाँ के बाद मैंडेट सक्रिय हो जाता है और बायपास सुरक्षा भी शुरू होती है।' : 'The owner is not on GENZ. You set the brokerage here (net / commission % / fixed); the owner reads it on a WhatsApp link and agrees with his signature (typed initials or a drawn signature). After his yes the mandate becomes ACTIVE and the bypass protection starts.'}</p>
            <button type="button" disabled={busy} onClick={startOwnerSign} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="mandate-broker-go">{hi ? 'ब्रोकरेज तय करें और मालिक का साइन लें' : 'Set brokerage & get the owner’s signature'}</button>
          </div>
        )}

        {/* ── Current state ── */}
        {(pending || active) && (
          <div className="mt-4 space-y-3">
            {[pending, active].filter(Boolean).map((m) => (
              <div key={m!.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900">{m!.id}</span>
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[m!.status]}`}>
                    {m!.status === 'ACTIVE' ? (hi ? 'सक्रिय — दोनों के हस्ताक्षर' : 'ACTIVE — both signed') : (hi ? 'ब्रोकर के हस्ताक्षर बाकी' : 'WAITING FOR BROKER')}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {/* v47 — whose agreement this is: the owner's and the listing broker's names (they were missing) */}
                  <dt className="text-slate-500">{hi ? 'मालिक' : 'Owner'}</dt>
                  <dd className="text-right font-semibold text-slate-900" data-testid="mandate-owner-name">{m!.ownerName || m!.offPlatformOwner?.name || (m!.ownerId === currentUser.id ? currentUser.name : '—')}{m!.offPlatformOwner?.phoneLast4 ? ` (••${m!.offPlatformOwner.phoneLast4})` : ''}</dd>
                  <dt className="text-slate-500">{hi ? 'लिस्टिंग ब्रोकर' : 'Listing broker'}</dt>
                  <dd className="text-right font-semibold text-slate-900" data-testid="mandate-broker-name">{m!.brokerName || (m!.brokerId === currentUser.id ? currentUser.name : brokerName)}</dd>
                  <dt className="text-slate-500">{hi ? 'विज्ञापित कीमत' : 'Advertised price'}</dt>
                  <dd className="text-right font-semibold">{formatINR(m!.advertisedPrice)}</dd>
                  <dt className="text-slate-500">{hi ? 'ब्रोकरेज का प्रकार' : 'Brokerage type'}</dt>
                  <dd className="text-right font-bold text-purple-900">
                    {m!.remunerationBasis === 'PERCENTAGE' ? `${hi ? 'कमीशन' : 'Commission'} ${m!.agreedCommissionPct}%`
                      : m!.remunerationBasis === 'FIXED_FEE' ? `${hi ? 'फिक्स्ड फ़ीस' : 'Fixed fee'} ${formatINR(m!.fixedFeeAmount || 0)}`
                      : `${hi ? 'नेट अमाउंट' : 'Net amount'} ${formatINR(m!.approvedNetPrice)}`}
                  </dd>
                  <dt className="text-slate-500">{hi ? 'लिस्टिंग ब्रोकर (विज्ञापित कीमत पर)' : 'Listing broker (at asking price)'}</dt>
                  <dd className="text-right font-bold text-emerald-800">{formatINR(m!.brokerRemunerationAtAsking ?? 0)}</dd>
                  <dt className="text-slate-500">{hi ? 'मालिक को मिलेगा (विज्ञापित कीमत पर)' : 'Owner receives (at asking price)'}</dt>
                  <dd className="text-right font-semibold">{formatINR(m!.ownerReceivesAtAsking ?? 0)}</dd>
                  <dt className="text-slate-500">{hi ? 'एंटी-बायपास अवधि' : 'Anti-bypass tail'}</dt>
                  <dd className="text-right">{m!.protectionPeriodDays} {hi ? 'दिन' : 'days'}</dd>
                  <dt className="text-slate-500">{hi ? 'मालिक के हस्ताक्षर' : 'Owner signed'}</dt>
                  <dd className="text-right">{formatDateTime(m!.ownerSignedAt)}</dd>
                  <dt className="text-slate-500">{hi ? 'ब्रोकर के हस्ताक्षर' : 'Broker signed'}</dt>
                  <dd className="text-right">{m!.brokerSignedAt ? formatDateTime(m!.brokerSignedAt) : '—'}</dd>
                </dl>
                {m!.consentId && m!.ownerSignature && (
                  <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2" data-testid="mandate-owner-sign">
                    <span className="text-slate-500">{hi ? 'मालिक का साइन (लिंक पर)' : 'Owner’s signature (on the link)'}</span>
                    {m!.ownerSignature.initials && <b className="rounded bg-slate-100 px-1.5 py-0.5">{m!.ownerSignature.initials}</b>}
                    {m!.ownerSignature.drawn && <img src={api.consentSignatureUrl(m!.consentId)} alt="" className="h-10 rounded border border-slate-200 bg-white px-1" />}
                  </div>
                )}
                {m!.status === 'ACTIVE' && <p className="mt-2 font-mono text-[10px] text-slate-400 break-all">SHA-256 {m!.agreementHash}</p>}

                {m!.status === 'PENDING_BROKER' && isOwner && (
                  <button
                    type="button" disabled={busy}
                    onClick={() => run(() => api.withdrawOwnerMandate(m!.id), hi ? 'मैंडेट वापस ले लिया।' : 'Mandate withdrawn.')}
                    className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {hi ? 'वापस लें' : 'Withdraw'}
                  </button>
                )}

                {m!.status === 'PENDING_BROKER' && isListingBroker && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {pwField}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button" disabled={busy || !password}
                        onClick={() => run(() => api.acceptOwnerMandate(m!.id, password), hi ? 'आपने मैंडेट पर हस्ताक्षर कर दिए — अब यह सक्रिय है।' : 'You co-signed — the mandate is now ACTIVE.')}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <UserCheck className="h-3.5 w-3.5" /> {hi ? 'स्वीकार करें और हस्ताक्षर करें' : 'Accept & co-sign'}
                      </button>
                      <button type="button" onClick={() => setShowDecline((v) => !v)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">
                        {hi ? 'अस्वीकार' : 'Decline'}
                      </button>
                    </div>
                    {showDecline && (
                      <div className="space-y-2">
                        <textarea value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} rows={2} placeholder={hi ? 'मालिक को कारण बताएँ' : 'Tell the owner why'} className="w-full rounded-lg border border-slate-300 p-2 text-xs" />
                        <button type="button" disabled={busy || declineNote.trim().length < 5} onClick={() => run(() => api.rejectOwnerMandate(m!.id, declineNote), hi ? 'मैंडेट अस्वीकृत।' : 'Mandate declined.')} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                          {hi ? 'अस्वीकार की पुष्टि' : 'Confirm decline'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {isOwner && active && !pending && !showForm && (
              <button type="button" onClick={() => setShowForm(true)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                {hi ? 'नई नेट रकम के साथ दोबारा मैंडेट बनाएँ' : 'Revise: submit a new mandate'}
              </button>
            )}
          </div>
        )}

        {/* ── Owner form ── */}
        {isOwner && property.listingBrokerId && !pending && showForm && (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="text-xs text-slate-600">{hi ? 'लिस्टिंग ब्रोकर' : 'Listing broker'}: <strong>{brokerName}</strong></div>
            <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                ['SURPLUS_ABOVE_NET', hi ? 'नेट अमाउंट' : 'Net amount', hi ? 'आपको फिक्स्ड रकम; ऊपर का ब्रोकर का' : 'You get a fixed sum; surplus is the broker\'s'],
                ['PERCENTAGE', hi ? 'कमीशन %' : 'Commission %', hi ? 'फ़ाइनल कीमत का %, आप देंगे' : '% of the final price, paid by you'],
                ['FIXED_FEE', hi ? 'फिक्स्ड फ़ीस' : 'Fixed fee', hi ? 'तय रकम, कीमत जो भी हो' : 'Flat ₹ whatever the price'],
              ] as const).map(([v, title, sub]) => (
                <button key={v} type="button" role="radio" aria-checked={basis === v} onClick={() => setBasis(v)}
                  className={`rounded-lg border p-2.5 text-left text-xs ${basis === v ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'}`}>
                  <div className="font-bold">{title}</div>
                  <div className={`mt-0.5 text-[10px] ${basis === v ? 'text-slate-300' : 'text-slate-500'}`}>{sub}</div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-700">{hi ? 'सार्वजनिक/विज्ञापित कीमत (₹)' : 'Advertised price (₹)'}</label>
                <input type="number" min={1} required value={advertised} onChange={(e) => setAdvertised(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold" />
                <p className="mt-0.5 text-[10px] text-slate-500">{formatINR(adv)}</p>
              </div>
              {basis === 'SURPLUS_ABOVE_NET' && (
                <div>
                  <label className="flex items-center gap-1 text-xs font-semibold text-purple-900"><Lock className="h-3 w-3" />{hi ? 'आपकी फिक्स्ड फ़ाइनल (नेट) रकम (₹)' : 'Your fixed final / net amount (₹)'}</label>
                  <input type="number" min={1} required value={net} onChange={(e) => setNet(e.target.value)} className="mt-1 w-full rounded-lg border border-purple-300 bg-purple-50/50 p-2 text-xs font-bold text-purple-950" />
                  <p className="mt-0.5 text-[10px] text-slate-500">{formatINR(netN)}</p>
                </div>
              )}
              {basis === 'PERCENTAGE' && (
                <div>
                  <label className="flex items-center gap-1 text-xs font-semibold text-purple-900"><Lock className="h-3 w-3" />{hi ? 'कमीशन (% , 0.1–10)' : 'Commission (% of final price, 0.1–10)'}</label>
                  <input type="number" step="0.1" min={0.1} max={10} required value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1 w-full rounded-lg border border-purple-300 bg-purple-50/50 p-2 text-xs font-bold text-purple-950" />
                </div>
              )}
              {basis === 'FIXED_FEE' && (
                <div>
                  <label className="flex items-center gap-1 text-xs font-semibold text-purple-900"><Lock className="h-3 w-3" />{hi ? 'फिक्स्ड ब्रोकरेज (₹)' : 'Fixed brokerage (₹)'}</label>
                  <input type="number" min={1} required value={fee} onChange={(e) => setFee(e.target.value)} className="mt-1 w-full rounded-lg border border-purple-300 bg-purple-50/50 p-2 text-xs font-bold text-purple-950" />
                  <p className="mt-0.5 text-[10px] text-slate-500">{formatINR(feeN || 0)}</p>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">{hi ? 'विज्ञापित कीमत पर आपको मिलेगा' : 'You receive if sold at the advertised price'}</span><strong>{formatINR(ownerGets)}</strong></div>
              <div className="flex justify-between mt-1"><span className="text-slate-500">{hi ? 'ब्रोकर का हिस्सा' : "Broker's remuneration"}</span><strong className="text-emerald-800">{formatINR(brokerAtAsking)} ({surplusPct.toFixed(1)}%)</strong></div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                {basis === 'SURPLUS_ABOVE_NET'
                  ? (hi ? 'अगर सौदा विज्ञापित कीमत से कम पर होता है तो ब्रोकर का हिस्सा उतना ही घटेगा; आपकी नेट रकम तय रहेगी।' : 'If it sells below the advertised price the broker\'s share shrinks by the same amount; your net amount stays fixed.')
                  : basis === 'PERCENTAGE'
                    ? (hi ? 'फ़ाइनल बिक्री कीमत पर कमीशन लगेगा — कीमत घटी तो ब्रोकरेज भी घटेगी।' : 'The commission applies to the final sale price — a lower price means a lower brokerage.')
                    : (hi ? 'ब्रोकरेज तय रहेगी, बिक्री कीमत चाहे जो हो।' : 'The brokerage stays the same whatever the final sale price.')}
              </p>
            </div>

            <div>
              <ProtectionPicker value={Number(days) || 30} onChange={(d) => setDays(String(d))} testId="mandate-days" />
              <p className="mt-0.5 text-[10px] text-slate-500">{hi ? 'इस अवधि में ब्रोकर द्वारा लाए गए खरीदार से सीधे सौदा करने पर भी ब्रोकर का हिस्सा देय रहेगा।' : 'If a buyer introduced by the broker deals with you directly during this period, the broker\'s share stays payable.'}</p>
            </div>
            {pwField}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{t('common.cancel', 'Cancel')}</button>
              <button type="submit" disabled={busy || !password} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {busy ? '…' : hi ? 'हस्ताक्षर करके ब्रोकर को भेजें' : 'Sign & send to listing broker'}
              </button>
            </div>
          </form>
        )}

        {!isOwner && !isListingBroker && (
          <p className="mt-4 text-xs text-slate-500">{hi ? 'केवल पढ़ने के लिए (एडमिन दृश्य)।' : 'Read-only (administrator view).'}</p>
        )}

        {/* ── History ── */}
        {mine.filter((m) => m.status !== 'ACTIVE' && m.status !== 'PENDING_BROKER').length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{hi ? 'पुराने मैंडेट' : 'History'}</div>
            <ul className="mt-1.5 space-y-1">
              {mine.filter((m) => m.status !== 'ACTIVE' && m.status !== 'PENDING_BROKER').map((m) => (
                <li key={m.id} className="flex items-center justify-between text-[11px] text-slate-600">
                  <span className="font-mono">{m.id}</span>
                  <span>{m.remunerationBasis === 'PERCENTAGE' ? `${m.agreedCommissionPct}%` : m.remunerationBasis === 'FIXED_FEE' ? formatINR(m.fixedFeeAmount || 0) : formatINR(m.approvedNetPrice)}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[m.status]}`}>{label('status', m.status)}</span>
                  {m.decisionNote && <span className="max-w-[140px] truncate italic" title={m.decisionNote}>“{m.decisionNote}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 flex items-center gap-1 text-[10px] text-slate-400"><Clock className="h-3 w-3" />{hi ? 'हर हस्ताक्षर ऑडिट ट्रेल में हैश के साथ दर्ज होता है।' : 'Every signature is written to the tamper-evident audit trail.'}</p>
      </div>
    </div>
  );
};
