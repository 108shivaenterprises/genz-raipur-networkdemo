/**
 * v33 — the buyer's “no direct deal” acknowledgement (tick + his mobile code) before his visit QR works.
 * Shows the broker where it stands, the link to send the buyer, and — when no SMS gateway is set — the code the buyer has just asked for.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Copy, Share2, Check, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

type Kind = 'PASS' | 'VISIT';
export const VisitAckPanel: React.FC<{ kind: Kind; refId: string; status?: 'NONE' | 'PENDING' | 'ACKED'; buyerName: string; subject: string; canManage: boolean; onStatus?: (s: 'NONE' | 'PENDING' | 'ACKED') => void; compact?: boolean }> = ({ kind, refId, status = 'NONE', buyerName, subject, canManage, onStatus, compact }) => {
  const tx = useTx();
  const [info, setInfo] = useState<any>(null);
  const [live, setLive] = useState(status);
  const [copied, setCopied] = useState(false);
  useEffect(() => setLive(status), [status]);
  const load = useCallback(() => api.visitAck(kind, refId).then(r => {
    setInfo(r.ack);
    if (r.ack?.status && r.ack.status !== live) { setLive(r.ack.status); onStatus?.(r.ack.status); }
  }).catch(() => undefined), [kind, refId, live, onStatus]);
  useEffect(() => {
    if (!canManage || live !== 'PENDING') return;
    load(); const t = window.setInterval(load, 8000); return () => window.clearInterval(t);
  }, [canManage, live, load]);

  if (live === 'ACKED') return <div className="flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] font-semibold text-emerald-900" data-testid="ack-done"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{tx('Buyer confirmed “no direct deal” with his own mobile code.', 'खरीदार ने अपने मोबाइल कोड से “सीधा सौदा नहीं” की सहमति दी।')}</div>;
  if (live === 'NONE') return canManage ? <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900" data-testid="ack-none"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{tx('No buyer acknowledgement: add the buyer’s 10-digit mobile when you book, so he confirms “no direct deal” and your protection is on record.', 'खरीदार की सहमति नहीं ली गई: बुक करते समय उसका 10 अंकों का मोबाइल डालें, ताकि वह “सीधा सौदा नहीं” की पुष्टि करे और आपकी सुरक्षा दर्ज हो।')}</div> : null;
  // PENDING
  if (!canManage) return <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-900" data-testid="ack-pending"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{tx('The buyer has not confirmed “no direct deal” yet — this visit cannot be verified until he does.', 'खरीदार ने अभी “सीधा सौदा नहीं” की पुष्टि नहीं की — जब तक वह न करे, यह विज़िट वेरिफाई नहीं होगी।')}</div>;
  const link = info ? `${window.location.origin}${info.link}` : '';
  const msg = `Namaste ${buyerName.split(' ')[0]} ji, ${subject} ki visit ke liye pehle yeh chhota confirmation kar lein, phir aapka visit pass khulega: ${link}`;
  return (
    <div className="space-y-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3" data-testid="ack-pending">
      <p className="flex items-start gap-1.5 text-xs font-bold text-amber-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{tx('Buyer must confirm first — then his QR / code opens', 'पहले खरीदार पुष्टि करेगा — फिर उसका QR / कोड खुलेगा')}</p>
      {!compact && <p className="text-[11px] text-amber-900">{tx('He ticks that he will not deal directly with the owner / builder without you, then confirms his own mobile with a code. Send him this link:', 'वह टिक करता है कि आपके बिना मालिक / बिल्डर से सीधा सौदा नहीं करेगा, फिर अपने मोबाइल का कोड डालता है। उसे यह लिंक भेजें:')}</p>}
      {!info ? <Loader2 className="h-4 w-4 animate-spin text-amber-700" /> : <>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" data-testid="ack-wa"><Share2 className="h-4 w-4" />{tx('Send on WhatsApp', 'WhatsApp भेजें')}</a>
          <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{tx('Copy link', 'लिंक कॉपी')}</button>
        </div>
        {info.codeForBuyer && <div className="rounded-lg border border-amber-400 bg-white p-2 text-center" data-testid="ack-code">
          <p className="text-[11px] font-bold text-amber-900">{tx(`${buyerName} is asking for his code — read it out:`, `${buyerName} कोड माँग रहा है — उसे बताएँ:`)}</p>
          <p className="font-mono text-3xl font-black tracking-[0.3em] text-amber-950">{info.codeForBuyer}</p></div>}
        {!info.codeForBuyer && !info.smsOn && info.brokerReads !== false && <p className="text-[11px] text-amber-900">{tx('When he asks for the code, it will show here for you to read out.', 'जब वह कोड माँगेगा, यहाँ दिखेगा — उसे बता दें।')}</p>}
        {!info.smsOn && info.brokerReads === false && <p className="text-[11px] text-amber-900">{tx('SMS is not set up on this server, so the buyer cannot get a code yet — ask GENZ support.', 'इस सर्वर पर SMS चालू नहीं है, इसलिए ख़रीदार को अभी कोड नहीं मिल सकता — GENZ सहायता से पूछें।')}</p>}
        {!info.codeForBuyer && info.smsOn && <p className="text-[11px] text-amber-900">{tx('The code goes to his mobile by SMS.', 'कोड उसके मोबाइल पर SMS से जाता है।')}</p>}
      </>}
    </div>
  );
};
