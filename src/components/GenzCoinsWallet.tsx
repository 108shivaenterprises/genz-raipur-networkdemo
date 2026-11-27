import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Coins,
  Clock,
  Lock,
  Unlock,
  Calculator,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR, formatDateTime } from '../lib/utils.js';
import { parseQuoteWithCactus } from '../lib/cactusBridge.js';

interface DiscountSlab {
  minInvoiceInr: number;
  maxInvoiceInr?: number | null;
  maxDiscountPct: number;
  label?: string;
}

interface RedemptionItem {
  id: string;
  partnerName: string;
  partnerCategory: string;
  invoiceAmountInr: number;
  coinDiscountInr?: number;
  coinsRedeemed?: number;
  cashToPayInr?: number;
  invoiceRef?: string;
  status?: string;
  createdAt?: string;
}

const DEFAULT_SLABS: DiscountSlab[] = [
  { minInvoiceInr: 25_000, maxInvoiceInr: 99_999, maxDiscountPct: 10 },
  { minInvoiceInr: 100_000, maxInvoiceInr: 499_999, maxDiscountPct: 15 },
  { minInvoiceInr: 500_000, maxInvoiceInr: null, maxDiscountPct: 20 },
];

const PARTNER_CATEGORIES: Array<{ value: string; en: string; hi: string }> = [
  { value: 'Thekedar / Civil', en: 'Thekedar / Civil', hi: 'ठेकेदार / सिविल' },
  { value: 'Painter', en: 'Painter', hi: 'पेंटर' },
  { value: 'Carpenter / Modular Kitchen', en: 'Carpenter / Modular Kitchen', hi: 'कारपेंटर / मॉड्यूलर किचन' },
  { value: 'Architect / Interior', en: 'Architect / Interior', hi: 'आर्किटेक्ट / इंटीरियर' },
  { value: 'Tiles & Marble', en: 'Tiles & Marble', hi: 'टाइल्स और मार्बल' },
  { value: 'Deep Cleaning', en: 'Deep Cleaning', hi: 'डीप क्लीनिंग' },
];

interface MudraEntry {
  id: string;
  dealId?: string;
  propertyId?: string;
  dealValueInr?: number;
  coinsIssued?: number;
  coinsRemaining?: number;
  status: string;
  issuedAt?: string;
  unlockedAt?: string | null;
  expiresAt?: string | null;
  notes?: string;
}

const MUDRA_STAGES = [
  {
    key: 'LOCKED_VISIT',
    stage: 1,
    titleEn: 'Stage 1: Visit Scheduled',
    titleHi: 'चरण 1: साइट विज़िट तय',
    descEn: 'Verify site visit to unlock Stage 1',
    descHi: 'चरण 1 अनलॉक करने के लिए साइट विज़िट वेरिफ़ाई करें',
  },
  {
    key: 'LOCKED_REGISTRY',
    stage: 2,
    titleEn: 'Stage 2: Visit Verified',
    titleHi: 'चरण 2: विज़िट वेरिफ़ाइड',
    descEn: 'Sign Broker-Client Commission Agreement to unlock',
    descHi: 'अनलॉक करने के लिए ब्रोकर-क्लाइंट कमीशन एग्रीमेंट साइन करें',
  },
  {
    key: 'ACTIVE',
    stage: 3,
    titleEn: 'Stage 3: Deal Commission Signed',
    titleHi: 'चरण 3: डील कमीशन साइन हुआ',
    descEn: 'Ready for Affiliated Partner Discounts!',
    descHi: 'संबद्ध पार्टनर डिस्काउंट के लिए तैयार!',
  },
] as const;

function getMudraStageIndex(status?: string): number {
  switch (status) {
    case 'LOCKED_VISIT':
      return 0;
    case 'LOCKED_REGISTRY':
      return 1;
    case 'ACTIVE':
    case 'PARTIALLY_REDEEMED':
    case 'REDEEMED':
      return 2;
    default:
      return 0;
  }
}

function computeSlabPct(invoiceAmountInr: number, slabs: DiscountSlab[]): number {
  if (!Number.isFinite(invoiceAmountInr) || invoiceAmountInr <= 0) return 0;
  const sorted = [...slabs].sort((a, b) => a.minInvoiceInr - b.minInvoiceInr);
  let matched = 0;
  for (const s of sorted) {
    if (invoiceAmountInr >= s.minInvoiceInr) {
      matched = s.maxDiscountPct;
    }
  }
  return matched;
}

function daysUntil(isoDate?: string | null, fallbackDays = 180): number {
  if (!isoDate) return fallbackDays;
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export const GenzCoinsWallet: React.FC = () => {
  const tx = useTx();
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Calculator & redemption form state
  const [partnerCategory, setPartnerCategory] = useState<string>(PARTNER_CATEGORIES[0].value);
  const [partnerName, setPartnerName] = useState('');
  const [invoiceAmountInput, setInvoiceAmountInput] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [quoteDraft, setQuoteDraft] = useState('');
  const [parseFeedback, setParseFeedback] = useState<string | null>(null);

  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [bookedViaGenz, setBookedViaGenz] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [wRes, cRes] = await Promise.all([
        api.coinsWallet().catch(() => null),
        api.coinsConfig().catch(() => null),
      ]);
      setWallet(wRes?.wallet ?? wRes ?? {});
      setConfig(cRes?.config ?? cRes ?? {});
    } catch (e: any) {
      setLoadErr(e?.message || tx('Could not load GENZ Mudra wallet.', 'GENZ मुद्रा वॉलेट लोड नहीं हो सका।'));
    } finally {
      setLoading(false);
    }
  }, [tx]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const slabs: DiscountSlab[] = useMemo(() => {
    const raw = Array.isArray(config?.slabs) && config.slabs.length > 0 ? config.slabs : DEFAULT_SLABS;
    return [...raw].sort((a, b) => a.minInvoiceInr - b.minInvoiceInr);
  }, [config]);

  const activeBalance = Number(wallet?.activeBalance ?? wallet?.activeCoins ?? 0);
  const lockedBalance = Number(wallet?.lockedBalance ?? wallet?.lockedCoins ?? 0);
  const isLockedOnly = activeBalance <= 0 && lockedBalance > 0;
  const validityDays = Number(config?.validityDays ?? 180);
  const expiryDaysLeft = daysUntil(wallet?.expiresAt, validityDays);
  const redemptions: RedemptionItem[] = Array.isArray(wallet?.redemptions) ? wallet.redemptions : [];
  const entries: MudraEntry[] = Array.isArray(wallet?.entries) ? wallet.entries : [];
  const defaultStageIdx = activeBalance > 0 ? 2 : lockedBalance > 0 ? 1 : 0;

  const invoiceAmountInr = Math.max(0, Number(invoiceAmountInput) || 0);
  const applicableSlabPct = computeSlabPct(invoiceAmountInr, slabs);
  const maxSlabDiscountInr = Math.floor((invoiceAmountInr * applicableSlabPct) / 100);
  const coinDiscountInr = Math.min(maxSlabDiscountInr, Math.max(0, activeBalance));
  const cashToPayInr = Math.max(0, invoiceAmountInr - coinDiscountInr);

  const mapCactusCategory = (cat?: string): string | undefined => {
    if (!cat) return undefined;
    const found = PARTNER_CATEGORIES.find((c) => c.value === cat || c.value.startsWith(cat));
    return found?.value;
  };

  const handleParseQuote = async (rawText?: string) => {
    const text = rawText ?? quoteDraft;
    const parsed = await parseQuoteWithCactus(text);
    if (parsed.invoiceAmountInr !== null) {
      setInvoiceAmountInput(String(parsed.invoiceAmountInr));
    }
    const mappedCategory = mapCactusCategory(parsed.partnerCategory);
    if (mappedCategory) {
      setPartnerCategory(mappedCategory);
    }
    if (parsed.partnerName) {
      setPartnerName(parsed.partnerName);
    }
    if (parsed.invoiceRef) {
      setInvoiceRef(parsed.invoiceRef);
    }
    if (parsed.invoiceAmountInr !== null || parsed.partnerName || parsed.partnerCategory) {
      setParseFeedback(
        tx(
          `Quote parsed (${parsed.confidence || parsed.engine})${parsed.invoiceAmountInr ? `: ${formatINR(parsed.invoiceAmountInr)}` : ''}.`,
          `कोट पढ़ा गया (${parsed.confidence || parsed.engine})${parsed.invoiceAmountInr ? `: ${formatINR(parsed.invoiceAmountInr)}` : ''}।`,
        ),
      );
    } else {
      setParseFeedback(tx('No amount detected in quote — please enter invoice amount manually.', 'कोट में रकम नहीं मिली — कृपया बिल की रकम खुद दर्ज करें।'));
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedeemMsg(null);
    if (!partnerName.trim()) {
      setRedeemMsg({ ok: false, text: tx('Enter contractor / partner name.', 'ठेकेदार / पार्टनर का नाम दर्ज करें।') });
      return;
    }
    if (invoiceAmountInr <= 0) {
      setRedeemMsg({ ok: false, text: tx('Enter a valid invoice amount.', 'सही बिल रकम दर्ज करें।') });
      return;
    }
    if (coinDiscountInr <= 0) {
      setRedeemMsg({
        ok: false,
        text: tx(
          'No active GENZ Mudra discount applies for this amount or balance.',
          'इस रकम या बैलेंस पर कोई सक्रिय GENZ मुद्रा छूट लागू नहीं होती।',
        ),
      });
      return;
    }

    if (!bookedViaGenz) {
      setRedeemMsg({
        ok: false,
        text: tx(
          'Please confirm booking via GENZ. GENZ is not liable for Mudra redemption on direct partner deals.',
          'कृपया GENZ के माध्यम से बुकिंग की पुष्टि करें। पार्टनर से सीधी डील पर GENZ मुद्रा रिडेम्पशन के लिए जिम्मेदार नहीं होगा।',
        ),
      });
      return;
    }

    setRedeeming(true);
    try {
      const res = await api.redeemCoins({
        partnerName: partnerName.trim(),
        partnerCategory,
        invoiceAmountInr,
        invoiceRef: invoiceRef.trim() || undefined,
        bookedViaGenz,
      });
      const used = Number(res?.coinDiscountInr ?? res?.coinsRedeemed ?? coinDiscountInr);
      setRedeemMsg({
        ok: true,
        text: tx(
          `Redeemed ${formatINR(used)} GENZ Mudra discount! Cash to pay: ${formatINR(Math.max(0, invoiceAmountInr - used))}.`,
          `${formatINR(used)} GENZ मुद्रा की छूट लागू हुई! नकद देय: ${formatINR(Math.max(0, invoiceAmountInr - used))}।`,
        ),
      });
      setPartnerName('');
      setInvoiceAmountInput('');
      setInvoiceRef('');
      setQuoteDraft('');
      setParseFeedback(null);
      await loadData();
    } catch (err: any) {
      setRedeemMsg({ ok: false, text: err?.message || tx('Redemption failed.', 'रिडेम्पशन असफल रहा।') });
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-amber-200 bg-white p-4" data-testid="genz-coins-wallet">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
        </div>
      </section>
    );
  }

  if (config?.enabled === false) {
    return null;
  }

  return (
    <section
      className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-white p-4 shadow-sm"
      data-testid="genz-coins-wallet"
    >
      {/* Header & Balance */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Coins className="h-5 w-5 text-amber-600" />
            {tx('GENZ Mudra & Partner Discount Wallet', 'GENZ मुद्रा और पार्टनर डिस्काउंट वॉलेट')}
          </h3>
          <p className="mt-0.5 text-xs font-semibold text-amber-800">
            {tx(
              'GENZ Mudra — Cash Discounts on Your Upcoming House Work',
              'GENZ मुद्रा — आपके आने वाले घर के काम पर नकद छूट',
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {tx('For Buyers & Tenants (Sale & Rental Commissions) · ₹1 Mudra = ₹1 Partner Discount Credit — Zero Hard Cash', 'खरीदार और किरायेदार (खरीद व किराया कमीशन) के लिए · ₹1 मुद्रा = ₹1 पार्टनर डिस्काउंट क्रेडिट — कोई नकद निकासी नहीं')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              isLockedOnly
                ? 'bg-slate-100 text-slate-700'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {isLockedOnly ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            {isLockedOnly ? tx('Locked', 'लॉक') : tx('Active', 'सक्रिय')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
            <Clock className="h-3 w-3" />
            {tx(`${expiryDaysLeft}d left`, `${expiryDaysLeft} दिन शेष`)}
          </span>
        </div>
      </div>

      {loadErr && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{loadErr}</span>
        </div>
      )}

      {/* Balance Cards */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-amber-200 bg-white p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {tx('Active GENZ Mudra', 'सक्रिय GENZ मुद्रा')}
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-700" data-testid="coins-active-balance">
            {formatINR(activeBalance)}
          </div>
          <div className="text-[11px] text-slate-500">
            {tx('Ready for partner invoices', 'पार्टनर बिल पर उपयोग के लिए तैयार')}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {tx('Locked Mudra', 'लॉक की गई मुद्रा')}
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-700" data-testid="coins-locked-balance">
            {formatINR(lockedBalance)}
          </div>
          <div className="text-[11px] text-slate-500">
            {tx('Unlocks on deal commission signing', 'डील कमीशन साइन होने पर अनलॉक होगी')}
          </div>
        </div>
      </div>

      {/* 3-Stage Mudra Unlock Progress & Why Locked */}
      <div className="mt-4 rounded-lg border border-amber-200/80 bg-white p-3 space-y-3" data-testid="mudra-unlock-progress">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-800">
            {tx('3-Stage Mudra Unlock Progress', '3-चरण मुद्रा अनलॉक प्रगति')}
          </h4>
          <span className="text-[11px] font-medium text-amber-800">
            {tx('Fast deal closure unlocks house-work discounts faster', 'तेज़ डील क्लोज़र से घर के काम की छूट जल्दी अनलॉक होती है')}
          </span>
        </div>

        {(entries.length > 0 ? entries.slice(0, 3) : [{ id: 'preview', status: defaultStageIdx === 2 ? 'ACTIVE' : defaultStageIdx === 1 ? 'LOCKED_REGISTRY' : 'LOCKED_VISIT' } as MudraEntry]).map((entry) => {
          const currentIdx = getMudraStageIndex(entry.status);
          const isExpired = entry.status === 'EXPIRED';
          const progressPct = isExpired ? 0 : ((currentIdx + 1) / 3) * 100;
          return (
            <div key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 space-y-2">
              {entry.coinsIssued !== undefined && (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    {tx('Mudra Credit', 'मुद्रा क्रेडिट')}: {formatINR(Number(entry.coinsRemaining ?? entry.coinsIssued ?? 0))}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    entry.status === 'LOCKED_VISIT'
                      ? 'bg-slate-200 text-slate-700'
                      : entry.status === 'LOCKED_REGISTRY'
                      ? 'bg-amber-100 text-amber-800'
                      : isExpired
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {entry.status === 'LOCKED_VISIT'
                      ? tx('Stage 1 · Visit Scheduled', 'चरण 1 · विज़िट तय')
                      : entry.status === 'LOCKED_REGISTRY'
                      ? tx('Stage 2 · Visit Verified', 'चरण 2 · विज़िट वेरिफ़ाइड')
                      : isExpired
                      ? tx('Expired', 'समाप्त')
                      : tx('Stage 3 · Active', 'चरण 3 · सक्रिय')}
                  </span>
                </div>
              )}

              {/* Progress Track */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    isExpired ? 'bg-rose-400' : currentIdx === 2 ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* 3 Stages */}
              <div className="grid gap-2 sm:grid-cols-3">
                {MUDRA_STAGES.map((st, idx) => {
                  const done = !isExpired && idx <= currentIdx;
                  const active = !isExpired && idx === currentIdx;
                  return (
                    <div
                      key={st.key}
                      className={`rounded-md border p-2 text-[11px] ${
                        done
                          ? active && idx < 2
                            ? 'border-amber-300 bg-amber-50 text-amber-950'
                            : 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-1 font-bold">
                        {done ? (
                          <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${idx === 2 || idx < currentIdx ? 'text-emerald-600' : 'text-amber-600'}`} />
                        ) : (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                        <span>{tx(st.titleEn, st.titleHi)}</span>
                      </div>
                      <p className="mt-0.5 leading-snug">{tx(st.descEn, st.descHi)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-950">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
          <p className="leading-relaxed">
            {tx(
              'Why Mudra is locked: Mudra unlocks step-by-step from site visit verification to signing the Broker-Client Commission Agreement. Close your deal faster to unlock instant cash discounts on upcoming house work (painter, carpenter, tiles, cleaning, architect, etc.) with GENZ-affiliated partners — zero hard cash.',
              'मुद्रा क्यों लॉक है: साइट विज़िट वेरिफ़िकेशन से लेकर ब्रोकर-क्लाइंट कमीशन एग्रीमेंट साइन होने तक मुद्रा चरणबद्ध तरीके से अनलॉक होती है। तेज़ी से डील पूरी करें और GENZ संबद्ध पार्टनर्स के साथ आने वाले घर के काम (पेंटर, कारपेंटर, टाइल्स, क्लीनिंग, आर्किटेक्ट आदि) पर तुरंत नकद छूट पाएँ — कोई हार्ड कैश नहीं।',
            )}
          </p>
        </div>
      </div>

      {/* Invoice-Value Tiered Discount Slabs */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">
          {tx('Invoice-Value Tiered Discount Slabs', 'बिल मूल्य के अनुसार डिस्काउंट स्लैब')}
        </h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="py-1.5 pr-3 font-semibold">{tx('Contractor Invoice Value', 'ठेकेदार बिल राशि')}</th>
                <th className="py-1.5 font-semibold text-right">{tx('Max Mudra Discount', 'अधिकतम मुद्रा छूट')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slabs.map((s, idx) => {
                const next = slabs[idx + 1];
                const upper = s.maxInvoiceInr ?? (next ? next.minInvoiceInr - 1 : null);
                const rangeLabel = upper
                  ? `${formatINR(s.minInvoiceInr)} – ${formatINR(upper)}`
                  : `${formatINR(s.minInvoiceInr)}+`;
                return (
                  <tr key={`${s.minInvoiceInr}-${idx}`}>
                    <td className="py-1.5 pr-3 font-medium text-slate-800">{rangeLabel}</td>
                    <td className="py-1.5 text-right font-bold text-emerald-700">{s.maxDiscountPct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Contractor / Architect Discount Calculator & Redemption Form */}
      <form onSubmit={handleRedeem} className="mt-4 rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-800">
          <Calculator className="h-4 w-4 text-amber-600" />
          {tx('Contractor / Architect Discount Calculator & Redeem', 'ठेकेदार / आर्किटेक्ट डिस्काउंट कैलकुलेटर और रिडीम')}
        </h4>

        {/* Smart Quote Paste (Cactus Bridge) */}
        <div className="rounded-lg bg-slate-50 p-2.5">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            {tx('Paste Contractor Quote (Optional Auto-fill)', 'ठेकेदार का कोट पेस्ट करें (ऑटो-फ़िल)')}
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={quoteDraft}
              onChange={(e) => setQuoteDraft(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted) {
                  setTimeout(() => handleParseQuote(pasted), 0);
                }
              }}
              placeholder={tx('e.g. Quote from Sharma Painters ₹1,20,000 INV-402', 'जैसे: Sharma Painters का कोट ₹1,20,000 INV-402')}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            />
            <button
              type="button"
              onClick={() => handleParseQuote()}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              {tx('Auto-fill', 'ऑटो-फ़िल')}
            </button>
          </div>
          {parseFeedback && <p className="mt-1 text-[11px] text-amber-800">{parseFeedback}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="font-semibold text-slate-700">{tx('Affiliated Partner Category', 'पार्टनर श्रेणी')}</span>
            <select
              value={partnerCategory}
              onChange={(e) => setPartnerCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
            >
              {PARTNER_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {tx(c.en, c.hi)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-slate-700">{tx('Partner / Contractor Name', 'पार्टनर / ठेकेदार का नाम')}</span>
            <input
              type="text"
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder={tx('e.g. Sharma Civil Works', 'जैसे: शर्मा सिविल वर्क्स')}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
            />
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-slate-700">{tx('Contractor Invoice Amount (₹)', 'ठेकेदार बिल राशि (₹)')}</span>
            <input
              type="number"
              min={0}
              step={500}
              value={invoiceAmountInput}
              onChange={(e) => setInvoiceAmountInput(e.target.value)}
              placeholder="150000"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
            />
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-slate-700">{tx('Invoice Ref / Bill No. (Optional)', 'बिल नंबर (वैकल्पिक)')}</span>
            <input
              type="text"
              value={invoiceRef}
              onChange={(e) => setInvoiceRef(e.target.value)}
              placeholder="INV-2026-01"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
            />
          </label>
        </div>

        {/* Live Discount Breakdown */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-amber-100 bg-amber-50/70 p-2.5 text-center">
          <div>
            <div className="text-[10px] font-semibold uppercase text-slate-500">{tx('Slab Cap', 'स्लैब सीमा')}</div>
            <div className="text-sm font-bold text-slate-900">{applicableSlabPct}%</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase text-slate-500">{tx('Mudra Discount', 'मुद्रा छूट')}</div>
            <div className="text-sm font-bold text-emerald-700" data-testid="coins-calc-discount">
              {formatINR(coinDiscountInr)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase text-slate-500">{tx('Cash to Pay', 'नकद देय')}</div>
            <div className="text-sm font-bold text-slate-900" data-testid="coins-calc-cash">
              {formatINR(cashToPayInr)}
            </div>
          </div>
        </div>

        {redeemMsg && (
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              redeemMsg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
            }`}
          >
            {redeemMsg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{redeemMsg.text}</span>
          </div>
        )}

        {/* Simple Rule: Contact GENZ to Book Your Service */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-950 space-y-1.5">
          <p className="font-semibold">
            {tx(
              'Simple Rule: Contact GENZ to book your service.',
              'सरल नियम: अपनी सेवा बुक करने के लिए GENZ से संपर्क करें।',
            )}
          </p>
          <p className="text-amber-900">
            {tx(
              'If you deal directly with any affiliated partner without booking through GENZ, GENZ is NOT liable for GENZ Mudra redemption or discounts.',
              'यदि आप GENZ के माध्यम से बुकिंग किए बिना किसी संबद्ध पार्टनर से सीधे डील करते हैं, तो GENZ मुद्रा रिडेम्पशन या छूट के लिए जिम्मेदार नहीं होगा।',
            )}
          </p>
          <label className="flex items-start gap-2 pt-0.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bookedViaGenz}
              onChange={(e) => setBookedViaGenz(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
            />
            <span className="font-medium text-slate-800">
              {tx(
                'I am booking this service via GENZ (not a direct partner deal)',
                'मैं यह सेवा GENZ के माध्यम से बुक कर रहा/रही हूँ (सीधी पार्टनर डील नहीं)',
              )}
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={redeeming || invoiceAmountInr <= 0 || coinDiscountInr <= 0 || !bookedViaGenz}
          data-testid="coins-redeem-btn"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {redeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
          {tx('Redeem GENZ Mudra Discount', 'GENZ मुद्रा डिस्काउंट रिडीम करें')}
        </button>
      </form>

      {/* Expandable Terms & Conditions */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowTerms((v) => !v)}
          className="flex min-h-10 w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-slate-500" />
            {tx('GENZ Mudra Terms & Conditions', 'GENZ मुद्रा नियम एवं शर्तें')}
          </span>
          {showTerms ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </button>
        {showTerms && (
          <div className="border-t border-slate-100 px-3 py-2.5 text-xs leading-relaxed text-slate-600 whitespace-pre-line">
            {config?.termsAndConditions?.trim() ||
              tx(
                '1. 1 GENZ Mudra = ₹1 discount credit with affiliated GENZ partners only (zero hard cash).\n2. Discount is capped by the invoice-value slab %.\n3. Mudra expires after 6 months (180 days) from credit date.',
                '1. 1 GENZ मुद्रा = ₹1 डिस्काउंट क्रेडिट केवल GENZ पार्टनर्स के साथ (कोई नकद निकासी नहीं)।\n2. छूट बिल मूल्य स्लैब % तक सीमित है।\n3. मुद्रा क्रेडिट होने की तारीख से 6 महीने (180 दिन) में समाप्त हो जाती है।',
              )}
          </div>
        )}
      </div>

      {/* Recent Redemptions History */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">
          <Receipt className="h-4 w-4 text-slate-500" />
          {tx('Recent Redemptions', 'हाल के रिडेम्पशन')}
        </h4>
        {redemptions.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            {tx('No redemptions yet. Use the calculator above on your next contractor bill.', 'अभी कोई रिडेम्पशन नहीं। अपने अगले ठेकेदार बिल पर ऊपर कैलकुलेटर का उपयोग करें।')}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-xs">
            {redemptions.map((r) => {
              const disc = Number(r.coinDiscountInr ?? r.coinsRedeemed ?? 0);
              const cash = Number(r.cashToPayInr ?? Math.max(0, r.invoiceAmountInr - disc));
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {r.partnerName} <span className="font-normal text-slate-500">· {r.partnerCategory}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {tx('Invoice', 'बिल')}: {formatINR(r.invoiceAmountInr)} · {tx('Cash', 'नकद')}: {formatINR(cash)}
                      {r.invoiceRef ? ` · ${r.invoiceRef}` : ''}
                      {r.createdAt ? ` · ${formatDateTime(r.createdAt)}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                      -{formatINR(disc)}
                    </span>
                    {r.status && <div className="mt-0.5 text-[10px] uppercase text-slate-400">{r.status}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
