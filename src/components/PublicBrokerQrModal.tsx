import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { printTarget } from '../lib/utils.js';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { UserProfile } from '../types/index.js';
import {
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Phone,
  MessageCircle,
  Share2,
  Download,
  Printer,
  Copy,
  Check,
  ExternalLink,
  X,
  Award,
  Building,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { TrustScoreBadge } from './TrustScoreBadge.js';

interface PublicBrokerQrModalProps {
  isOpen: boolean;
  currentUser: UserProfile;
  brokers: UserProfile[];
  initialBrokerId?: string;
  onClose: () => void;
}

export const PublicBrokerQrModal: React.FC<PublicBrokerQrModalProps> = ({
  isOpen,
  currentUser,
  brokers,
  initialBrokerId,
  onClose,
}) => {
  const tx = useTx();
  const { lang } = useI18n();
  if (!isOpen) return null;

  // Filter to brokers only or include admin
  const brokerList = brokers.filter(
    (u) => u.role === 'BROKER' || u.role === 'SUPERADMIN' || u.role === 'ADMIN'
  );

  const [selectedBrokerId, setSelectedBrokerId] = useState<string>(
    initialBrokerId || (currentUser.role === 'BROKER' ? currentUser.id : brokerList[0]?.id || currentUser.id)
  );

  const selectedBroker =
    brokerList.find((b) => b.id === selectedBrokerId) ||
    brokers.find((b) => b.id === selectedBrokerId) ||
    currentUser;

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  // Own QR → the public visiting card (works for anyone, no login). Falls back to the in-app link until the card is switched on.
  const [cardPath, setCardPath] = useState<string>('');
  const [cardOff, setCardOff] = useState(false);
  useEffect(() => {
    setCardPath(''); setCardOff(false);
    if (selectedBroker.id !== currentUser.id) return;
    api.growthMe().then(r => { if (r.card.enabled) setCardPath(r.card.path); else setCardOff(true); }).catch(() => {});
  }, [selectedBroker.id, currentUser.id]);

  // Derive RERA number and agency if not present
  const reraNum = selectedBroker.reraNumber || tx('Not provided', 'दिया नहीं गया');
  const company = selectedBroker.companyName || tx('Independent broker', 'स्वतंत्र ब्रोकर');
  const profileUrl = typeof window !== 'undefined'
    ? (cardPath ? `${window.location.origin}${cardPath}` : `${window.location.origin}/?tab=properties&brokerId=${selectedBroker.id}`)
    : `https://genz-broker-network.local/broker/${selectedBroker.id}`;

  // Generate QR Code data URL whenever selected broker changes
  useEffect(() => {
    QRCode.toDataURL(profileUrl, {
      width: 280,
      margin: 1.5,
      color: {
        dark: '#0f172a', // slate-900
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [profileUrl]);

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(profileUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `GENZ-Broker-QR-${selectedBroker.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    printTarget();
  };

  const whatsAppShareUrl = `https://wa.me/?text=${encodeURIComponent(
    `🤝 *${tx('Broker Profile - GENZ Broker Network', 'ब्रोकर प्रोफ़ाइल - GENZ Broker Network')}*\n\n*${tx('Name', 'नाम')}:* ${selectedBroker.name}\n*${tx('Firm', 'फ़र्म')}:* ${company}\n*RERA ${tx('No', 'नं.')}:* ${reraNum}\n*${tx('Trust Score', 'ट्रस्ट स्कोर')}:* ${selectedBroker.trustScore ?? 'N/A'}/100\n\n${tx('View the profile and listings here:', 'प्रोफ़ाइल और लिस्टिंग यहाँ देखें:')}\n${profileUrl}`
  )}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-900 text-white rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-400 text-slate-950 rounded-lg shadow-xs">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-white">
                  {tx('Verified Broker Digital QR Card', 'ब्रोकर डिजिटल QR कार्ड')}
                </h3>
                <span className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5">
                  {selectedBroker.reraNumber ? tx('RERA no. provided', 'RERA नंबर दिया है') : tx('RERA not provided', 'RERA नंबर नहीं दिया')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {tx('Digital identity & verified inventory credentials for client presentation', 'क्लाइंट को दिखाने के लिए डिजिटल पहचान और इन्वेंटरी की जानकारी')}
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

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Broker Selector (allows viewing any broker's badge or own) */}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-2.5">
            <span className="text-xs font-semibold text-slate-600 pl-1">{tx('Select Broker Profile:', 'ब्रोकर प्रोफ़ाइल चुनें:')}</span>
            <select
              value={selectedBrokerId}
              onChange={(e) => setSelectedBrokerId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-2xs focus:border-slate-900 focus:outline-hidden"
            >
              {brokerList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id}) - {tx('Trust', 'ट्रस्ट')} {b.trustScore ?? 'N/A'}
                </option>
              ))}
            </select>
          </div>

          {/* DIGITAL CARD PREVIEW (PRINTABLE / SHAREABLE) */}
          <div className="print-target relative rounded-2xl border-2 border-amber-400/60 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-5 sm:p-6 text-white shadow-xl overflow-hidden">
            {/* Background Decorative Emblem */}
            <div className="absolute -right-8 -top-8 w-40 h-40 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -left-8 -bottom-8 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* Top Card Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-400 text-slate-950 font-bold text-xs">
                  GZ
                </div>
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-amber-400 uppercase">
                    GENZ BROKER NETWORK
                  </div>
                  <div className="text-[9px] text-slate-400 tracking-wide">CO-BROKING EXCHANGE</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                <ShieldCheck className="h-3 w-3" />
                <span>{tx('Anti-Bypass Member', 'एंटी-बायपास सदस्य')}</span>
              </div>
            </div>

            {/* Main Profile Info */}
            <div className="mt-4 flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="h-18 w-18 rounded-xl bg-slate-800 border-2 border-amber-400/80 flex items-center justify-center text-xl font-bold text-amber-300 shadow-md overflow-hidden">
                  {selectedBroker.avatarUrl ? (
                    <img
                      src={selectedBroker.avatarUrl}
                      alt={selectedBroker.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{selectedBroker.name.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                {selectedBroker.avatarUrl && <span className="absolute -top-2 left-0 whitespace-nowrap rounded-full bg-emerald-600 px-1.5 py-0.5 text-[8px] font-bold text-white" data-testid="photo-verified-mark">{tx('Photo checked by GENZ', 'फ़ोटो GENZ ने जाँची')}</span>}
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
              </div>

              {/* Bio & Details */}
              <div className="flex-1 text-center sm:text-left space-y-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h4 className="text-base font-bold text-white tracking-tight">{selectedBroker.name}</h4>
                  <span className="rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.2 text-[10px] font-semibold">
                    {selectedBroker.id}
                  </span>
                </div>
                <p className="text-xs text-slate-300 flex items-center justify-center sm:justify-start gap-1">
                  <Building className="h-3 w-3 text-slate-400" />
                  <span>{company}</span>
                </p>
                <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px] text-slate-400 font-mono">
                  <span className="bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                    RERA: <span className="text-amber-300 font-semibold">{reraNum}</span>
                  </span>
                  <span className="bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60 flex items-center gap-1 text-slate-300">
                    <MapPin className="h-2.5 w-2.5 text-slate-400" /> {[(selectedBroker as any).city, (selectedBroker as any).state].filter(Boolean).join(', ') || tx('India', 'भारत')}
                  </span>
                </div>
              </div>
            </div>

            {cardOff && (
              <p className="mb-2 rounded-lg bg-amber-50 p-2 text-[11px] font-medium text-amber-900">
                {lang === 'hi'
                  ? <>यह QR ऐसे इन-ऐप लिंक पर खुलता है जिसके लिए लॉगिन चाहिए। अपना पब्लिक कार्ड <b>नेटवर्क बढ़ाएँ</b> में चालू करें — तब QR किसी के भी लिए खुलेगा।</>
                  : <>This QR opens an in-app link that needs a login. Switch on your public visiting card in <b>Grow Network</b> and the QR will open a shareable page for anyone.</>}
              </p>
            )}
            {/* QR CODE DISPLAY BOX */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl bg-white p-3.5 text-slate-900 shadow-inner">
              {/* QR Image */}
              <div className="flex flex-col items-center shrink-0">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={tx('Broker QR Code', 'ब्रोकर QR कोड')}
                    className="h-32 w-32 rounded-lg border border-slate-200 shadow-2xs"
                  />
                ) : (
                  <div className="h-32 w-32 rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                    {tx('Generating QR...', 'QR बन रहा है...')}
                  </div>
                )}
                <span className="mt-1 text-[9px] font-mono text-slate-500 font-semibold tracking-wider">
                  {tx('SCAN FOR PROFILE', 'प्रोफ़ाइल के लिए स्कैन करें')}
                </span>
              </div>

              {/* Verified Metrics Beside QR */}
              <div className="flex-1 w-full space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-500">{tx('Trust Index:', 'ट्रस्ट इंडेक्स:')}</span>
                  <TrustScoreBadge user={selectedBroker} variant="compact" />
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-500">{tx('Verified Site Visits:', 'सत्यापित साइट विज़िट:')}</span>
                  <span className="font-bold text-slate-900">
                    {selectedBroker.verifiedSiteVisitsCount ?? 0} {tx('Visits', 'विज़िट')}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-500">{tx('Co-Brokered Closings:', 'को-ब्रोकिंग से हुई डील:')}</span>
                  <span className="font-bold text-emerald-700">
                    {selectedBroker.completedDealsCount ?? 0} {tx('Deals Done', 'डील पूरी')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{tx('Anti-Bypass Rule:', 'एंटी-बायपास नियम:')}</span>
                  <span className="font-semibold text-slate-800 text-[11px]">{tx('30-Day Recorded Protection', '30 दिन की दर्ज सुरक्षा')}</span>
                </div>
              </div>
            </div>

            {/* Contact Action Bar */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
              {selectedBroker.phone && (
                <a
                  href={`tel:${selectedBroker.phone}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 font-medium transition-colors border border-slate-700 text-xs"
                >
                  <Phone className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{tx('Call', 'कॉल')} {selectedBroker.phone}</span>
                </a>
              )}
              <a
                href={whatsAppShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 font-bold transition-colors shadow-2xs text-xs"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>{tx('WhatsApp QR Card', 'WhatsApp QR कार्ड')}</span>
              </a>
            </div>
          </div>

          {/* Action Tools */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2.5 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLink ? tx('Link Copied!', 'लिंक कॉपी हुआ!') : tx('Copy Link', 'लिंक कॉपी करें')}</span>
            </button>
            <button
              onClick={handleDownloadQr}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2.5 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{tx('Download QR', 'QR डाउनलोड करें')}</span>
            </button>
            <button
              onClick={handlePrint}
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2.5 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{tx('Print Badge', 'बैज प्रिंट करें')}</span>
            </button>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 bg-slate-50 rounded-b-2xl shrink-0">
          <p className="text-[11px] text-slate-500">
            {tx('Identity is checked by GENZ admin KYC. Always confirm the RERA number on the state RERA website.', 'पहचान GENZ एडमिन KYC से जाँची जाती है। RERA नंबर राज्य RERA की वेबसाइट पर ज़रूर मिलाएँ।')}
          </p>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            {tx('Close', 'बंद करें')}
          </button>
        </div>
      </div>
    </div>
  );
};
