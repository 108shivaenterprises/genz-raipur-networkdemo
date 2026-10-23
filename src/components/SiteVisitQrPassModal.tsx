import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { SiteVisit, Property, UserProfile } from '../types/index.js';
import { formatDateTime, printTarget } from '../lib/utils.js';
import { api } from '../lib/api.js';
import { QrScanner } from './QrScanner.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { VisitAckPanel } from './VisitAckPanel.js';
import { ScanLineNote } from './ScanPoint.js';
import {
  QrCode,
  CheckCircle2,
  Clock,
  MapPin,
  Building,
  User,
  ShieldCheck,
  Printer,
  Copy,
  Check,
  X,
  AlertCircle,
  Smartphone,
  Navigation,
} from 'lucide-react';

interface SiteVisitQrPassModalProps {
  isOpen: boolean;
  visit: SiteVisit | null;
  property?: Property;
  dealId?: string;
  currentUser: UserProfile;
  onClose: () => void;
  onSuccess?: () => void;
  /** v45: a QR already scanned elsewhere (header Scan) — check in with it at once */
  initialScan?: string;
}

export const SiteVisitQrPassModal: React.FC<SiteVisitQrPassModalProps> = ({
  isOpen,
  visit,
  property,
  dealId,
  currentUser,
  onClose,
  onSuccess,
  initialScan,
}) => {
  const tx = useTx();
  const { lang } = useI18n();
  if (!isOpen || !visit) return null;

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState(false);
  const [loadingCheckin, setLoadingCheckin] = useState(false);
  const [checkinSuccess, setCheckinSuccess] = useState(visit.isVerified);
  const [error, setError] = useState('');
  const [manualOtp, setManualOtp] = useState('');
  const [scannedToken, setScannedToken] = useState('');
  const [scanning, setScanning] = useState(false);
  const [ackLive, setAckLive] = useState<'NONE' | 'PENDING' | 'ACKED' | undefined>(visit.ackStatus);
  useEffect(() => setAckLive(visit.ackStatus), [visit.id, visit.ackStatus]);
  const ackPending = ackLive === 'PENDING' && !checkinSuccess;
  const onScanned = (text: string) => {
    setScanning(false);
    try {
      const j = JSON.parse(text);
      if (j.visitId !== visit.id) { setError(tx('This QR belongs to a different visit.', 'यह QR किसी दूसरी विज़िट का है।')); return; }
      if (!j.secret) { setError(tx('This QR has no check-in secret — ask the customer to open their own pass.', 'इस QR में चेक-इन का गुप्त कोड नहीं है — ग्राहक से अपना पास खोलने को कहें।')); return; }
      setScannedToken(j.secret); handleScanCheckin(j.secret);
    } catch { setError(tx('That QR is not a GENZ property-visit pass.', 'यह QR GENZ का प्रॉपर्टी-विज़िट पास नहीं है।')); }
  };

  // v45: scanned from the header QR button → go straight to check-in (once)
  useEffect(() => { if (initialScan && !visit.isVerified) onScanned(initialScan); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const passToken = `VISIT-PASS-${visit.id}`;
  const verificationPayload = JSON.stringify({
    visitId: visit.id,
    dealRoomId: visit.dealRoomId,
    propertyId: visit.propertyId,
    token: passToken,
    secret: visit.qrToken || undefined,
  });

  // Generate QR Code on load
  useEffect(() => {
    QRCode.toDataURL(verificationPayload, {
      width: 240,
      margin: 1.5,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate Visit QR', err));
  }, [verificationPayload]);

  useEffect(() => {
    setCheckinSuccess(visit.isVerified);
    setError('');
  }, [visit]);

  // Simulate or execute on-site QR Scan Check-In
  const handleScanCheckin = async (override?: string) => {
    setLoadingCheckin(true);
    setError('');
    try {
      // Real device position (never a simulated one); the server rejects check-ins > 5 km from the property.
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 8000, maximumAge: 60000 });
      });
      const lat = pos?.coords.latitude;
      const lon = pos?.coords.longitude;
      const token = override || visit.qrToken || scannedToken.trim();
      if (!token) throw new Error(tx('Scan the customer’s QR (or paste the QR token they show) to check in.', 'चेक-इन के लिए ग्राहक का QR स्कैन करें (या वे जो QR टोकन दिखाएँ उसे पेस्ट करें)।'));

      const res = await api.checkinSiteVisitQr(
        visit.id,
        token,
        lat !== undefined ? 'On-site QR check-in verified with the device location.' : 'On-site QR check-in verified (device location was not available).',
        lat,
        lon
      );

      if (res.success) {
        setCheckinSuccess(true);
        if (onSuccess) onSuccess();
      } else {
        throw new Error(tx('QR check-in verification failed.', 'QR चेक-इन का सत्यापन नहीं हो सका।'));
      }
    } catch (err: any) {
      setError(err?.message || tx('Failed to verify QR check-in.', 'QR चेक-इन सत्यापित नहीं हो सका।'));
    } finally {
      setLoadingCheckin(false);
    }
  };

  // Manual OTP verification fallback
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualOtp.trim()) return;
    setLoadingCheckin(true);
    setError('');
    try {
      const res = await api.verifySiteVisitOtp(visit.id, manualOtp.trim(), 'Physical inspection OTP verified.');
      if (res.success) {
        setCheckinSuccess(true);
        if (onSuccess) onSuccess();
      } else {
        throw new Error(tx('Invalid OTP code.', 'OTP सही नहीं है।'));
      }
    } catch (err: any) {
      setError(err?.message || tx('Verification error', 'सत्यापन में त्रुटि'));
    } finally {
      setLoadingCheckin(false);
    }
  };

  const handleCopyPass = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${tx('Site Visit Pass', 'साइट विज़िट पास')} #${visit.id} — ${visit.customerName}. ${visit.otpCode ? `${tx('Verification Code', 'सत्यापन कोड')}: ${visit.otpCode}` : tx('The verification code was sent to the customer.', 'सत्यापन कोड ग्राहक को भेज दिया गया है।')}`);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-900 text-white rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg shadow-xs">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-white">
                  {tx('Site Visit QR Pass & Check-In', 'साइट विज़िट QR पास और चेक-इन')}
                </h3>
                <span className="font-mono text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  {visit.id}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {tx('Official anti-bypass verification pass for on-site client inspections', 'साइट पर क्लाइंट निरीक्षण के लिए एंटी-बायपास सत्यापन पास')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={tx('Close', 'बंद करें')}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Pass Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* PRINTABLE PASS CARD */}
          <div className="print-target rounded-2xl border-2 border-dashed border-slate-300 bg-gradient-to-b from-slate-50 to-white p-5 shadow-sm space-y-4">
            {/* Top Pass Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  {tx('VERIFIED VISIT PASS', 'सत्यापित विज़िट पास')}
                </span>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Building className="h-4 w-4 text-blue-600" />
                  <span>{property?.title || `${tx('Property', 'प्रॉपर्टी')}: ${visit.propertyId}`}</span>
                </h4>
                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-slate-400" />
                  <span>{[property?.locality, property?.city, property?.state].filter(Boolean).join(', ') || tx('Location not set', 'लोकेशन नहीं भरी')}</span>
                </p>
              </div>

              {/* Status Badge */}
              <div className="text-right">
                {checkinSuccess ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 text-[11px] font-bold shadow-2xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{tx('Check-In Verified', 'चेक-इन सत्यापित')}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1 text-[11px] font-bold">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    <span>{tx('Check-In Pending', 'चेक-इन बाकी')}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Client & Schedule Row */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-100/70 p-3 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 flex items-center gap-1">
                  <User className="h-3 w-3 text-slate-400" />
                  {tx('Client / Visitor:', 'क्लाइंट / आगंतुक:')}
                </span>
                <span className="font-bold text-slate-900 block mt-0.5">{visit.customerName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 flex items-center gap-1">
                  <Clock className="h-3 w-3 text-slate-400" />
                  {tx('Scheduled Arrival:', 'तय आगमन:')}
                </span>
                <span className="font-semibold text-slate-800 block mt-0.5">
                  {formatDateTime(visit.scheduledTime)}
                </span>
              </div>
            </div>

            <ScanLineNote kind="VISIT" scanAt={visit.scanAt} />
            {/* v33 — the buyer confirms “no direct deal” first; until then there is no QR / code */}
            {ackLive && ackLive !== 'ACKED' && !checkinSuccess && (
              <VisitAckPanel kind="VISIT" refId={visit.id} status={ackLive} buyerName={visit.customerName} subject={property?.title || visit.propertyId} canManage={visit.brokerId === currentUser.id} onStatus={setAckLive} />
            )}
            {ackLive === 'ACKED' && !checkinSuccess && <VisitAckPanel kind="VISIT" refId={visit.id} status="ACKED" buyerName={visit.customerName} subject={property?.title || visit.propertyId} canManage={false} />}

            {/* QR CODE DISPLAY */}
            {ackPending ? <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500" data-testid="qr-hidden">{tx('The QR and code appear here once the buyer has confirmed.', 'खरीदार की पुष्टि के बाद QR और कोड यहाँ दिखेंगे।')}</p> : <div className="flex flex-col items-center justify-center py-2 space-y-2">
              <div className="p-3 bg-white rounded-2xl border-2 border-slate-900 shadow-md">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt={tx('Visit QR Code', 'विज़िट QR कोड')} className="h-44 w-44 object-contain" />
                ) : (
                  <div className="h-44 w-44 flex items-center justify-center text-xs text-slate-400">
                    {tx('Generating Pass QR...', 'पास QR बन रहा है...')}
                  </div>
                )}
              </div>
              <div className="text-center">
                <span className="text-xs font-mono font-bold text-slate-900">
                  {tx('CHALLENGE CODE', 'चैलेंज कोड')}: <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{visit.otpCode || tx('sent to customer', 'ग्राहक को भेजा गया')}</span>
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {tx('Scan on site or share with buyer/owner to confirm physical arrival', 'साइट पर स्कैन करें या खरीदार/मालिक से साझा करें ताकि पहुँचना पक्का हो')}
                </p>
              </div>
            </div>}

            {/* Anti-Bypass Legal Stamp */}
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-[11px] text-emerald-900 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">{tx('30-Day Anti-Bypass Evidence:', '30 दिन का एंटी-बायपास सबूत:')}</span>{' '}
                <span>
                  {tx('A verified check-in is recorded with a timestamp as proof of your introduction, under the platform’s anti-bypass rule. It is supporting evidence, not a legal guarantee.', 'सत्यापित चेक-इन समय-सहित आपके परिचय के सबूत के रूप में दर्ज होता है — प्लेटफ़ॉर्म के एंटी-बायपास नियम के तहत। यह सहायक सबूत है, कानूनी गारंटी नहीं।')}
                </span>
              </div>
            </div>
          </div>

          {/* INTERACTIVE SCANNER / INSTANT CHECK-IN SECTION */}
          {!checkinSuccess && visit.brokerId === currentUser.id && currentUser.role !== 'PROPERTY_OWNER' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[11px] text-amber-900 leading-relaxed">
              <strong>{tx('You cannot verify this visit:', 'आप यह विज़िट सत्यापित नहीं कर सकते:')}</strong>{' '}{tx('you scheduled it, so the scan / OTP check must be done by the property side (owner or listing broker). Ask them to scan the customer’s QR.', 'विज़िट आपने तय की है, इसलिए स्कैन / OTP सत्यापन प्रॉपर्टी की तरफ़ से (मालिक या लिस्टिंग ब्रोकर) होगा। ग्राहक का QR उनसे स्कैन करवाएँ।')}
            </div>
          ) : !checkinSuccess ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                <Smartphone className="h-4 w-4 text-blue-700" />
                <span>{tx('On-Site Client Arrival Check-In', 'साइट पर क्लाइंट के पहुँचने का चेक-इन')}</span>
              </div>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                {tx('When you and your client arrive at the property, tap below to check in with the QR pass (your device location is attached if you allow it):', 'जब आप और क्लाइंट प्रॉपर्टी पर पहुँचें, तो QR पास से चेक-इन करने के लिए नीचे टैप करें (अनुमति देने पर आपके डिवाइस की लोकेशन जुड़ेगी):')}
              </p>

              <button
                type="button"
                onClick={() => handleScanCheckin()}
                disabled={loadingCheckin}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white p-2.5 text-xs font-bold transition-all shadow-sm disabled:opacity-50"
              >
                <Navigation className="h-4 w-4 animate-pulse" />
                <span>{loadingCheckin ? tx('Checking location...', 'लोकेशन जाँची जा रही है...') : tx('Confirm Arrival & Check In Now', 'पहुँच की पुष्टि करें और अभी चेक-इन करें')}</span>
              </button>

              {!visit.qrToken && !scanning && (
                <button type="button" onClick={() => { setError(''); setScanning(true); }} className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white p-2.5 text-xs font-bold text-blue-800">
                  <QrCode className="h-4 w-4" /><span>{tx('Scan the customer’s QR with the camera', 'ग्राहक का QR कैमरे से स्कैन करें')}</span>
                </button>
              )}
              {scanning && <QrScanner onResult={onScanned} onClose={() => setScanning(false)} />}
              {!visit.qrToken && (
                <input
                  type="text"
                  value={scannedToken}
                  onChange={(e) => setScannedToken(e.target.value)}
                  placeholder={tx('QR token shown on the customer’s pass', 'ग्राहक के पास पर दिखा QR टोकन')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900"
                />
              )}

              {/* Fallback OTP Form */}
              <form onSubmit={handleVerifyOtp} className="pt-2 border-t border-blue-200/80 flex gap-2">
                <input
                  type="text"
                  value={manualOtp}
                  onChange={(e) => setManualOtp(e.target.value)}
                  placeholder={tx('Enter 6-digit OTP from the client', 'क्लाइंट से 6-अंकों का OTP लेकर डालें')}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono font-bold text-slate-900"
                />
                <button
                  type="submit"
                  disabled={loadingCheckin}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {tx('Verify OTP', 'OTP सत्यापित करें')}
                </button>
              </form>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center space-y-1.5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="text-xs font-bold text-emerald-950">{tx('Site Visit Successfully Verified!', 'साइट विज़िट सफलतापूर्वक सत्यापित!')}</h4>
              <p className="text-[11px] text-emerald-800">
                {lang === 'hi'
                  ? <>जुड़ा डील रूम (यदि कोई है) <strong>“साइट विज़िट हो गई”</strong> चरण पर पहुँच गया। समय और (उपलब्ध हो तो) लोकेशन का सबूत ऑडिट ट्रेल में दर्ज है।</>
                  : <>The linked Deal Room (if any) moves to <strong>“Site Visit Done”</strong>. The timestamp and (where available) location are recorded in the audit trail.</>}
              </p>
            </div>
          )}

          {/* Quick Tools */}
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleCopyPass}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {copiedToken ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedToken ? tx('Pass Info Copied!', 'पास की जानकारी कॉपी हुई!') : tx('Copy Pass Text', 'पास का टेक्स्ट कॉपी करें')}</span>
            </button>
            <button
              type="button"
              onClick={() => printTarget()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{tx('Print Visit Pass', 'विज़िट पास प्रिंट करें')}</span>
            </button>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 bg-slate-50 rounded-b-2xl shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">
            {checkinSuccess ? tx('STATUS: VERIFIED & RECORDED', 'स्थिति: सत्यापित और दर्ज') : tx('STATUS: AWAITING ARRIVAL', 'स्थिति: पहुँचने का इंतज़ार')}
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            {tx('Done', 'हो गया')}
          </button>
        </div>
      </div>
    </div>
  );
};
