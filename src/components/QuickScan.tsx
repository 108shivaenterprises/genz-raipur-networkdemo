/**
 * v45 — scan a visit QR straight from the header (the "QR" button), without first opening Visit QR / a deal room.
 *  - a broker-to-broker property-visit QR (the buyer's pass, JSON with visitId + VISIT-PASS-…): if this visit is on MY
 *    property (owner / listing broker) the check-in opens right away with the scanned secret; if I cannot confirm it (v79: I booked it,
 *    it is too early, the window closed …) the pass opens with the reason and what to do next;
 *  - a builder-project pass (GENZV:… or /v/CODE): only the builder's team may scan it → Visit QR opens with that code;
 *  - anything else: a plain message saying what it is and who scans it.
 * Same rules as the Visit QR screen (v34): never verify a visit you booked yourself, never someone else's visit.
 */
import React, { useState } from 'react';
import { QrCode, ScanLine, X, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { goto } from '../lib/goto.js';
import { normalizeCode } from '../shared/visitRules.js';
import { QrScanner } from './QrScanner.js';
import { SiteVisitQrPassModal } from './SiteVisitQrPassModal.js';
import type { SiteVisit, UserProfile } from '../types/index.js';
import type { TabType } from './NavigationTabs.js';

/** the small sheet behind the header QR button: my card, or scan */
export const QrMenu: React.FC<{ onCard?: () => void; onScan: () => void; onClose: () => void }> = ({ onCard, onScan, onClose }) => {
  const tx = useTx();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" onClick={onClose} data-testid="qr-menu">
      <div className="w-full max-w-sm space-y-2 rounded-t-2xl bg-white p-4 pb-6 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900">QR</p>
          <button type="button" onClick={onClose} aria-label={tx('Close', 'बंद करें')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={onScan} data-testid="qr-menu-scan" className="flex min-h-16 w-full items-center gap-3 rounded-xl bg-slate-900 px-4 text-left text-white">
          <ScanLine className="h-6 w-6 text-amber-400" />
          <span><span className="block text-sm font-bold">{tx('Scan a visit QR', 'विज़िट QR स्कैन करें')}</span>
            <span className="block text-[11px] text-slate-300">{tx('At the property: scan the buyer’s pass to verify the visit', 'प्रॉपर्टी पर: खरीदार का पास स्कैन करके विज़िट पक्की करें')}</span></span>
        </button>
        {onCard && (
          <button type="button" onClick={onCard} data-testid="qr-menu-card" className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left text-slate-900">
            <QrCode className="h-6 w-6 text-blue-600" />
            <span><span className="block text-sm font-bold">{tx('My QR card', 'मेरा QR कार्ड')}</span>
              <span className="block text-[11px] text-slate-500">{tx('Your verified broker card to show or share', 'दिखाने या भेजने के लिए आपका वेरिफ़ाइड ब्रोकर कार्ड')}</span></span>
          </button>
        )}
      </div>
    </div>
  );
};

export const QuickScan: React.FC<{ currentUser: UserProfile; canBuilderScan: boolean; hasVisitsTab: boolean; onNavigate: (t: TabType) => void; onClose: () => void }> = ({ currentUser, canBuilderScan, hasVisitsTab, onNavigate, onClose }) => {
  const tx = useTx();
  const [cam, setCam] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<{ visit: SiteVisit; raw: string } | null>(null);

  const onResult = async (raw: string) => {
    setCam(false); setMsg('');
    const t = String(raw || '').trim();
    let j: any = null; try { j = JSON.parse(t); } catch { /* not json */ }
    // 1. broker-to-broker property visit (the buyer's own pass)
    if (j && typeof j.visitId === 'string' && String(j.token || '').startsWith('VISIT-PASS-')) {
      setBusy(true);
      try {
        const r = await api.getSiteVisits();
        const v = (r.siteVisits || []).find((x: SiteVisit) => x.id === j.visitId);
        if (!v) return setMsg(tx('This is a GENZ visit QR, but NOT yours — it is not a visit on your property, so you cannot scan it.', 'यह GENZ का विज़िट QR है, पर आपका नहीं — यह आपकी प्रॉपर्टी की विज़िट नहीं है, इसलिए आप इसे स्कैन नहीं कर सकते।'));
        if (v.isVerified) return setMsg(tx('This visit is already verified.', 'यह विज़िट पहले ही वेरिफाई हो चुकी है।'));
        // v79 — a visit I cannot confirm (I booked it, it is too early / past its window …) opens the pass with the reason and the way forward,
        // instead of a dead-end line; only a visit I CAN confirm is checked in with the scanned QR
        if (v.gate && !v.gate.ok) { setOpen({ visit: v, raw: '' }); return; }
        if (v.brokerId === currentUser.id) return setMsg(tx('You booked this visit, so you cannot verify it yourself — the owner or the listing broker scans the buyer’s QR.', 'यह विज़िट आपने बुक की है, इसलिए आप खुद वेरिफाई नहीं कर सकते — खरीदार का QR मालिक या लिस्टिंग ब्रोकर स्कैन करेगा।'));
        setOpen({ visit: v, raw: t });
      } catch (e: any) { setMsg(e?.message || 'Error'); } finally { setBusy(false); }
      return;
    }
    // 2. builder-project pass
    const code = normalizeCode(t);
    if (code || /^GENZV:/i.test(t) || /\/v\/[A-Za-z0-9]{10}/.test(t)) {
      if (canBuilderScan && code) { goto('visits', { pass: code }, onNavigate); onClose(); return; }
      return setMsg(tx('This is a builder-project visit pass — only that builder’s team can scan it, at the project.', 'यह बिल्डर-प्रोजेक्ट का विज़िट पास है — इसे सिर्फ़ उसी बिल्डर की टीम प्रोजेक्ट पर स्कैन कर सकती है।'));
    }
    setMsg(tx('This is not a GENZ visit QR. Ask the buyer to open his pass from the GENZ link again.', 'यह GENZ का विज़िट QR नहीं है। खरीदार से GENZ लिंक से अपना पास दोबारा खुलवाएँ।'));
  };

  if (open) {
    return <SiteVisitQrPassModal isOpen visit={open.visit} dealId={open.visit.dealRoomId} currentUser={currentUser} initialScan={open.raw}
      onClose={onClose} onSuccess={() => window.dispatchEvent(new Event('genz:visits-changed'))} />;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" data-testid="quick-scan">
      <div className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-4 pb-6 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><ScanLine className="h-4 w-4" />{tx('Scan a visit QR', 'विज़िट QR स्कैन करें')}</p>
          <button type="button" onClick={onClose} aria-label={tx('Close', 'बंद करें')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        {cam && <QrScanner onResult={onResult} onClose={() => setCam(false)} />}
        {busy && <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500" />}
        {msg && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700" data-testid="quick-scan-msg">{msg}</p>}
        {!cam && (
          <div className="flex gap-2">
            <button type="button" onClick={() => { setMsg(''); setCam(true); }} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white"><ScanLine className="h-4 w-4" />{tx('Scan again', 'फिर से स्कैन करें')}</button>
            {hasVisitsTab && <button type="button" onClick={() => { goto('visits', {}, onNavigate); onClose(); }} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">{tx('Open Visit QR', 'विज़िट QR खोलें')}</button>}
          </div>
        )}
        <p className="text-[11px] text-slate-500">{tx('No camera? Open the visit in the deal room and type the buyer’s OTP.', 'कैमरा नहीं? डील रूम में विज़िट खोलकर खरीदार का OTP डालें।')}</p>
      </div>
    </div>
  );
};
