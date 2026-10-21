import React, { useMemo } from 'react';
import { ArrowRight, HardHat, Hammer, Percent, BadgeCheck, Users, Scale, FileLock2, History, Lock } from 'lucide-react';
import type { ConstructionLead, UserProfile } from '../types/index.js';
import { formatINR } from '../lib/utils.js';
import { useTx } from '../lib/i18n.js';

/**
 * Contractor home. A contractor has no property / deal-room access, so this screen shows only construction work:
 * open (masked) opportunities, the jobs they hold, and the referral fee they owe the referring broker.
 * GENZ does not hold that money (it moves between contractor and broker) — the figures are records of what was agreed.
 */
const STATUS: Record<ConstructionLead['status'], [string, string]> = {
  OPEN: ['Open', 'खुली'],
  ASSIGNED: ['Assigned to you', 'आपको मिली'],
  IN_PROGRESS: ['In progress', 'काम चालू'],
  COMPLETED: ['Completed', 'पूरी'],
  CANCELLED: ['Cancelled', 'रद्द'],
};

export const ContractorDashboard: React.FC<{
  currentUser: UserProfile;
  constructionLeads: ConstructionLead[];
  onNavigate: (tab: any) => void;
}> = ({ currentUser, constructionLeads, onNavigate }) => {
  const tx = useTx();
  const s = useMemo(() => {
    const open = constructionLeads.filter(l => l.status === 'OPEN');
    const mine = constructionLeads.filter(l => l.assignedContractorId === currentUser.id);
    const active = mine.filter(l => l.status === 'ASSIGNED' || l.status === 'IN_PROGRESS');
    const withFee = mine.filter(l => (l.referralCommissionDue || 0) > 0);
    return {
      open, mine, active,
      openValue: open.reduce((a, l) => a + (l.estimatedBudget || 0), 0),
      activeValue: active.reduce((a, l) => a + (l.finalContractValue ?? l.estimatedBudget ?? 0), 0),
      feeDue: withFee.filter(l => !l.referralCommissionPaid).reduce((a, l) => a + (l.referralCommissionDue || 0), 0),
      feePaid: withFee.filter(l => l.referralCommissionPaid).reduce((a, l) => a + (l.referralCommissionDue || 0), 0),
    };
  }, [constructionLeads, currentUser.id]);

  const cards: Array<{ k: string; v: string; sub: string; icon: React.ReactNode; tone?: string }> = [
    { k: tx('Open opportunities', 'खुले अवसर'), v: String(s.open.length), sub: tx(`Total budget ${formatINR(s.openValue)} · customer details masked`, `कुल बजट ${formatINR(s.openValue)} · ग्राहक की जानकारी छुपी`), icon: <HardHat className="h-4 w-4 text-orange-500" /> },
    { k: tx('My active jobs', 'मेरे चालू काम'), v: String(s.active.length), sub: tx(`Contract value ${formatINR(s.activeValue)}`, `कॉन्ट्रैक्ट मूल्य ${formatINR(s.activeValue)}`), icon: <Hammer className="h-4 w-4 text-slate-500" /> },
    { k: tx('Referral fee to pay', 'देय रेफ़रल फ़ीस'), v: formatINR(s.feeDue), sub: tx('Pay the referring broker directly — the broker confirms receipt in the lead', 'रेफ़र करने वाले ब्रोकर को सीधे दें — ब्रोकर लीड में "फ़ीस मिल गई" कन्फ़र्म करेगा'), icon: <Percent className="h-4 w-4 text-amber-600" />, tone: s.feeDue ? 'text-amber-700' : '' },
    { k: tx('Referral fee settled', 'चुकाई गई रेफ़रल फ़ीस'), v: formatINR(s.feePaid), sub: tx(`${s.mine.filter(l => l.referralCommissionPaid).length} job(s) settled`, `${s.mine.filter(l => l.referralCommissionPaid).length} काम निपटे`), icon: <BadgeCheck className="h-4 w-4 text-emerald-600" />, tone: 'text-emerald-700' },
  ];

  const list = [...s.mine.filter(l => l.status !== 'CANCELLED'), ...s.open].slice(0, 6);
  const links: Array<[string, string, string, React.ReactNode]> = [
    ['construction', 'Construction Leads', 'कंस्ट्रक्शन लीड', <HardHat key="c" className="h-3.5 w-3.5" />],
    ['team', 'My Team', 'मेरी टीम', <Users key="t" className="h-3.5 w-3.5" />],
    ['disputes', 'Disputes', 'विवाद', <Scale key="d" className="h-3.5 w-3.5" />],
    ['pdocs', 'Protected Docs', 'सुरक्षित दस्तावेज़', <FileLock2 key="p" className="h-3.5 w-3.5" />],
    ['audit', 'My activity log', 'मेरा एक्टिविटी लॉग', <History key="a" className="h-3.5 w-3.5" />],
  ];

  return (
    <div className="space-y-6" data-testid="contractor-dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <div key={c.k} className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500"><span className="font-semibold text-slate-700">{c.k}</span>{c.icon}</div>
            <div className={`mt-2 text-2xl font-bold tracking-tight ${c.tone || 'text-slate-900'}`}>{c.v}</div>
            <div className="mt-1 text-xs text-slate-500">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">{tx('Construction pipeline', 'कंस्ट्रक्शन पाइपलाइन')}</h2>
              <p className="text-xs text-slate-500">{tx('Your jobs first, then open leads you can take', 'पहले आपके काम, फिर वे खुली लीड जो आप ले सकते हैं')}</p>
            </div>
            <button onClick={() => onNavigate('construction')} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-900 hover:text-amber-700">{tx('All leads', 'सभी लीड')} <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          {list.length === 0 ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">{tx('No construction leads right now. New leads from verified brokers show up here.', 'अभी कोई कंस्ट्रक्शन लीड नहीं है। वेरिफ़ाइड ब्रोकरों की नई लीड यहाँ दिखेंगी।')}</p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {list.map(l => (
                <li key={l.id} className="min-w-0 rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-mono text-slate-700">{l.id}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${l.status === 'OPEN' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}>{tx(...STATUS[l.status])}</span>
                  </div>
                  <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-slate-900">{l.title}</h3>
                  <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                    <div>{tx('Budget', 'बजट')}: <strong className="text-slate-900">{formatINR(l.finalContractValue ?? l.estimatedBudget)}</strong></div>
                    <div>{tx('Area', 'क्षेत्र')}: {l.approximateLocation}</div>
                    <div>{tx('Referral fee', 'रेफ़रल फ़ीस')}: {l.referralCommissionPct}%</div>
                  </div>
                  <button onClick={() => onNavigate('construction')} className="mt-3 w-full border-t border-slate-100 pt-2 text-left text-xs font-semibold text-slate-900 hover:underline">{tx('View details', 'विवरण देखें')}</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Lock className="h-4 w-4 text-slate-500" />{tx('How lead privacy works', 'लीड की प्राइवेसी कैसे काम करती है')}</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{tx('Customer name, phone and exact site address stay hidden on every open lead. They are shown to you only after you take the lead by accepting the referral agreement. The referral fee between you and the broker is paid directly to him — GENZ does not hold it and only records what you both confirm. GENZ’s own fees, if any, are shown in Plans & Fees.', 'हर खुली लीड पर ग्राहक का नाम, फ़ोन और साइट का पूरा पता छुपा रहता है। रेफ़रल एग्रीमेंट मंज़ूर करके लीड लेने के बाद ही ये आपको दिखते हैं। आपके और ब्रोकर के बीच की रेफ़रल फ़ीस सीधे उसे दी जाती है — GENZ उसे अपने पास नहीं रखता, सिर्फ़ वही रिकॉर्ड करता है जो आप दोनों कन्फ़र्म करते हैं। GENZ की अपनी फ़ीस (अगर कोई हो) Plans & Fees में दिखती है।')}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">{tx('Quick links', 'जल्दी खोलें')}</h3>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {links.map(([id, en, hi, icon]) => (
                <button key={id} onClick={() => onNavigate(id)} className="inline-flex min-h-10 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100">
                  <span className="inline-flex items-center gap-2">{icon}{tx(en, hi)}</span><ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
