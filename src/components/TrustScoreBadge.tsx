import React, { useState } from 'react';
import { UserProfile } from '../types/index.js';
import { getTrustTierBadgeConfig } from '../lib/trustScore.js';
import { useI18n } from '../lib/i18n.js';
import { ShieldCheck, Award, CheckCircle2, MapPin, Handshake, Info, X } from 'lucide-react';

interface TrustScoreBadgeProps {
  user?: UserProfile;
  score?: number;
  tier?: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'NEW';
  completedDeals?: number;
  verifiedSiteVisits?: number;
  variant?: 'compact' | 'pill' | 'detailed' | 'minimal';
  showDetailsModalOnClick?: boolean;
  className?: string;
}

export const TrustScoreBadge: React.FC<TrustScoreBadgeProps> = ({
  user,
  score: propScore,
  tier: propTier,
  completedDeals: propDeals,
  verifiedSiteVisits: propVisits,
  variant = 'compact',
  showDetailsModalOnClick = true,
  className = '',
}) => {
  const [showModal, setShowModal] = useState<boolean>(false);

  // Derive score and tier from user or direct props
  const score = propScore ?? user?.trustScore ?? (user?.verificationStatus === 'VERIFIED' ? 75 : 30);
  const tier = propTier ?? user?.trustTier ?? (score >= 88 ? 'PLATINUM' : score >= 72 ? 'GOLD' : score >= 50 ? 'SILVER' : score >= 25 ? 'BRONZE' : 'NEW');
  const completedDeals = propDeals ?? user?.completedDealsCount ?? 0;
  const verifiedVisits = propVisits ?? user?.verifiedSiteVisitsCount ?? 0;

  const config = getTrustTierBadgeConfig(tier);
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const tx = (en: string, h: string) => (hi ? h : en);
  const HI_TIER: Record<string, { label: string; short: string; desc: string }> = {
    PLATINUM: { label: 'प्लैटिनम एलीट ब्रोकर', short: 'प्लैटिनम', desc: '2+ पूरी डील और कई वेरिफ़ाइड साइट विज़िट वाला टॉप-टियर ब्रोकर।' },
    GOLD: { label: 'गोल्ड वेरिफ़ाइड पार्टनर', short: 'गोल्ड', desc: 'वेरिफ़ाइड साइट विज़िट और तय को-ब्रोकिंग एग्रीमेंट वाला भरोसेमंद क्लोज़र।' },
    SILVER: { label: 'सिल्वर एसोसिएट', short: 'सिल्वर', desc: 'वेरिफ़ाइड साइट विज़िट और चालू डील पाइपलाइन वाला सक्रिय प्रमाणित ब्रोकर।' },
    BRONZE: { label: 'ब्रॉन्ज़ पार्टनर', short: 'ब्रॉन्ज़', desc: 'RERA-पंजीकृत पार्टनर जो एक्सचेंज पर लेन-देन शुरू कर रहा है।' },
    NEW: { label: 'नया सदस्य', short: 'नया', desc: 'नया जुड़ा ब्रोकर जिसकी शुरुआती डील ऑनबोर्डिंग चल रही है।' },
  };
  const T = hi ? (HI_TIER[tier as string] ?? HI_TIER.NEW) : { label: config.label, short: config.shortLabel, desc: config.description };

  // Minimal variant: just the score badge (e.g. for tight header tags)
  if (variant === 'minimal') {
    return (
      <span
        onClick={(e) => {
          if (showDetailsModalOnClick) {
            e.stopPropagation();
            setShowModal(true);
          }
        }}
        title={tx(`Trust Score: ${score}/100 (${T.label})`, `ट्रस्ट स्कोर: ${score}/100 (${T.label})`)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer border ${config.badgeClass} ${className}`}
      >
        <ShieldCheck className="h-3 w-3 shrink-0" />
        <span>{score}</span>
      </span>
    );
  }

  // Pill variant: compact pill with icon, tier and score
  if (variant === 'pill') {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            if (showDetailsModalOnClick) {
              e.stopPropagation();
              setShowModal(true);
            }
          }}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all hover:shadow-xs active:scale-95 ${config.badgeClass} ${className}`}
        >
          <Award className="h-3.5 w-3.5 shrink-0" />
          <span>{T.short}</span>
          <span className="font-mono px-1 py-0.2 rounded bg-black/10 text-[10px]">{score}</span>
        </button>

        {showModal && renderModal()}
      </>
    );
  }

  // Detailed variant: for broker cards, profile sidebars, etc.
  if (variant === 'detailed') {
    return (
      <>
        <div className={`rounded-xl border p-3.5 space-y-2.5 ${config.badgeClass} ${className}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${config.iconBg}`}>
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                  <span>{T.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${config.pillClass}`}>
                    {score}/100
                  </span>
                </div>
                <div className="text-[10px] opacity-75">{T.desc}</div>
              </div>
            </div>

            {showDetailsModalOnClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowModal(true);
                }}
                className="text-slate-400 hover:text-slate-700 p-1"
                title={tx('View Trust Score Breakdown', 'ट्रस्ट स्कोर का ब्योरा देखें')}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Progress Bar towards 100 */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-medium opacity-80">
              <span>{tx('Platform Trust Level', 'प्लेटफ़ॉर्म ट्रस्ट स्तर')}</span>
              <span className="font-mono font-bold">{score}%</span>
            </div>
            <div className="w-full bg-black/10 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  tier === 'PLATINUM'
                    ? 'bg-emerald-600'
                    : tier === 'GOLD'
                    ? 'bg-amber-600'
                    : tier === 'SILVER'
                    ? 'bg-sky-600'
                    : 'bg-slate-600'
                }`}
                style={{ width: `${Math.max(5, Math.min(100, score))}%` }}
              />
            </div>
          </div>

          {/* Metrics Evidence Badges */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-black/5 text-[11px]">
            <div className="flex items-center gap-1.5 font-medium">
              <Handshake className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>{completedDeals} {hi ? 'पूरी डील' : completedDeals === 1 ? 'Closed Deal' : 'Closed Deals'}</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              <span>{verifiedVisits} {hi ? 'वेरिफ़ाइड विज़िट' : verifiedVisits === 1 ? 'Verified Visit' : 'Verified Visits'}</span>
            </div>
          </div>
        </div>

        {showModal && renderModal()}
      </>
    );
  }

  // Default: Compact badge with tooltip/modal support
  return (
    <>
      <span
        onClick={(e) => {
          if (showDetailsModalOnClick) {
            e.stopPropagation();
            setShowModal(true);
          }
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border shadow-2xs transition-all cursor-pointer hover:brightness-95 ${config.badgeClass} ${className}`}
        title={tx(`Trust Score: ${score}/100 based on ${completedDeals} completed deals & ${verifiedVisits} verified visits. Click for audit breakdown.`, `ट्रस्ट स्कोर: ${score}/100 — ${completedDeals} पूरी डील और ${verifiedVisits} वेरिफ़ाइड विज़िट पर आधारित। ब्योरे के लिए दबाएँ।`)}
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span className="font-bold">{T.short}</span>
        <span className="text-[11px] font-mono font-bold bg-white/60 dark:bg-black/10 px-1.5 py-0.5 rounded border border-black/5">
          {score}
        </span>
      </span>

      {showModal && renderModal()}
    </>
  );

  function renderModal() {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
        onClick={() => setShowModal(false)}
      >
        <div
          className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${config.iconBg}`}>
                <Award className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{T.label}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${config.pillClass}`}>
                    {score}/100
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {user?.name ? `${user.name} (${user.companyName || tx('Independent', 'स्वतंत्र')})` : tx('Broker Trust Score Audit', 'ब्रोकर ट्रस्ट स्कोर ऑडिट')}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Description */}
          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/80 text-xs text-slate-600 leading-relaxed">
            <p className="font-semibold text-slate-900 mb-1">{tx('How is the GENZ Trust Score calculated?', 'GENZ ट्रस्ट स्कोर कैसे बनता है?')}</p>
            {tx('The GENZ Trust Score is an objective rating calculated directly from real transaction data: verified closed deals, completed co-broking agreements, and OTP/GPS physical site inspections.', 'GENZ ट्रस्ट स्कोर असली लेन-देन डेटा से सीधे निकली एक निष्पक्ष रेटिंग है: वेरिफ़ाइड पूरी डील, पूरे हुए को-ब्रोकिंग एग्रीमेंट और OTP/GPS से हुई साइट विज़िट।')}
          </div>

          {/* Calculation Breakdown */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
              {tx('Audit Breakdown & Evidence', 'ऑडिट ब्योरा और सबूत')}
            </h4>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-white">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <div>
                    <div className="font-semibold text-slate-800">{tx('RERA & Platform KYC Verification', 'RERA और प्लेटफ़ॉर्म KYC वेरिफ़िकेशन')}</div>
                    <div className="text-[11px] text-slate-500">
                      {user?.reraNumber ? `RERA: ${user.reraNumber}` : tx('Government RERA credential validation', 'सरकारी RERA प्रमाणपत्र की जाँच')}
                    </div>
                  </div>
                </div>
                <span className="font-mono font-bold text-emerald-700">
                  {user?.verificationStatus === 'VERIFIED' ? tx('+50 pts', '+50 अंक') : tx('+20 pts', '+20 अंक')}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-white">
                <div className="flex items-center gap-2">
                  <Handshake className="h-4 w-4 text-emerald-600" />
                  <div>
                    <div className="font-semibold text-slate-800">{tx('Closed Co-Broking Deals', 'पूरी हुई को-ब्रोकिंग डील')}</div>
                    <div className="text-[11px] text-slate-500">
                      {tx(`${completedDeals} deals closed through the Deal Room with a signed digital agreement`, `${completedDeals} डील डील रूम में साइन किए डिजिटल एग्रीमेंट से पूरी हुईं`)}
                    </div>
                  </div>
                </div>
                <span className="font-mono font-bold text-emerald-700">
                  +{Math.min(completedDeals * 15, 40)} {tx('pts', 'अंक')}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-white">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="font-semibold text-slate-800">{tx('OTP-Verified Physical Site Visits', 'OTP से वेरिफ़ाइड साइट विज़िट')}</div>
                    <div className="text-[11px] text-slate-500">
                      {tx(`${verifiedVisits} inspections verified with genuine buyer OTP`, `${verifiedVisits} विज़िट खरीदार के असली OTP से वेरिफ़ाइड`)}
                    </div>
                  </div>
                </div>
                <span className="font-mono font-bold text-emerald-700">
                  +{Math.min(verifiedVisits * 8, 30)} {tx('pts', 'अंक')}
                </span>
              </div>
            </div>
          </div>

          {/* Tier Milestones Guide */}
          <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 text-[11px] space-y-1.5">
            <div className="font-semibold text-slate-700">{tx('Network Tier Milestones:', 'नेटवर्क टियर के पड़ाव:')}</div>
            <div className="grid grid-cols-2 gap-1.5 text-slate-600">
              <div>🌟 <strong>{tx('Platinum', 'प्लैटिनम')}</strong>: 88 - 100 {tx('pts', 'अंक')} ({tx('Elite Closer', 'एलीट क्लोज़र')})</div>
              <div>💎 <strong>{tx('Gold', 'गोल्ड')}</strong>: 72 - 87 {tx('pts', 'अंक')} ({tx('Proven Partner', 'आज़माया हुआ पार्टनर')})</div>
              <div>🛡️ <strong>{tx('Silver', 'सिल्वर')}</strong>: 50 - 71 {tx('pts', 'अंक')} ({tx('Active Associate', 'सक्रिय एसोसिएट')})</div>
              <div>🥉 <strong>{tx('Bronze', 'ब्रॉन्ज़')}</strong>: 25 - 49 {tx('pts', 'अंक')} ({tx('New Partner', 'नया पार्टनर')})</div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setShowModal(false)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              {tx('Close Breakdown', 'ब्योरा बंद करें')}
            </button>
          </div>
        </div>
      </div>
    );
  }
};
