import React, { useState, useEffect, useRef } from 'react';
import { PageTitle } from './PageTitle.js';
import { AuditEvent } from '../types/index.js';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/utils.js';
import { History, ShieldCheck, CheckCircle2, AlertTriangle, RefreshCw, Hash, Search, ChevronDown, Loader2 } from 'lucide-react';
import { useTx } from '../lib/i18n.js';

export const AuditTrailView: React.FC = () => {
  const tx = useTx();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [integrity, setIntegrity] = useState<{ isValid: boolean; checkedCount: number; brokenEventId?: number; fullCheckedAt?: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  // v20: the trail comes one page at a time (newest first) with search — it grows by lakhs of lines a year
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [err, setErr] = useState('');
  const seq = useRef(0);

  const fetchAuditLogs = async (o: { more?: boolean; full?: boolean } = {}) => {
    const my = ++seq.current;
    setLoading(true); setErr('');
    try {
      const res = await api.getAuditLogs({ before: o.more ? next : null, q: q.trim(), entity, full: o.full });
      if (my !== seq.current) return;
      setEvents(prev => (o.more ? [...prev, ...(res.events || [])] : res.events || []));
      setIntegrity(res.integrity || null);
      setTotal(res.total ?? (res.events || []).length);
      setNext(res.nextBefore ?? null);
      setHasMore(!!res.hasMore);
    } catch (e: any) {
      if (my === seq.current) setErr(e?.message || 'Could not load');
    } finally {
      if (my === seq.current) setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => fetchAuditLogs(), q ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [q, entity]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageTitle title={tx('Audit trail', 'ऑडिट ट्रेल')} meta={tx(`${events.length} of ${total} shown`, `${total} में से ${events.length} दिख रहे`)} help={tx('Append-only record of registrations, price revisions, site visit OTP stamps, and commission ratifications.', 'रजिस्ट्रेशन, कीमत बदलाव, साइट विज़िट OTP स्टैम्प और कमीशन मंज़ूरी का केवल-जोड़ने वाला रिकॉर्ड — इसमें कुछ मिटाया या बदला नहीं जा सकता।')} />
        </div>

        <div className="flex items-center gap-3">
          {integrity && integrity.isValid ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{tx(`SHA-256 Chain Intact (${integrity.checkedCount} events verified)`, `SHA-256 चेन सुरक्षित (${integrity.checkedCount} घटनाएँ जाँची गईं)`)}</span>
            </div>
          ) : integrity && !integrity.isValid ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-800">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span>{tx('Chain Integrity Discrepancy Detected', 'चेन की अखंडता में गड़बड़ी मिली')}</span>
            </div>
          ) : null}

          <button
            onClick={() => fetchAuditLogs({ full: true })}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{tx('Verify Chain', 'चेन जाँचें')}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Search action, record id, person id or detail', 'कार्रवाई, रिकॉर्ड ID, व्यक्ति ID या ब्योरा खोजें')}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm" aria-label={tx('Search the audit trail', 'ऑडिट ट्रेल खोजें')} />
        </label>
        <select value={entity} onChange={e => setEntity(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm" aria-label={tx('Record type', 'रिकॉर्ड का प्रकार')}>
          <option value="">{tx('All record types', 'सभी प्रकार')}</option>
          {['PROPERTY', 'DEAL', 'VISIT', 'COMMISSION', 'DISPUTE', 'LEAD', 'VERIFICATION', 'SYSTEM'].map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      {err && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">{err}</p>}

      {/* Events List */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">{tx('Block #', 'ब्लॉक #')}</th>
                <th className="px-4 py-3">{tx('Timestamp', 'समय')}</th>
                <th className="px-4 py-3">{tx('Actor & Role', 'किसने · भूमिका')}</th>
                <th className="px-4 py-3">{tx('Entity Ref', 'संबंधित रिकॉर्ड')}</th>
                <th className="px-4 py-3">{tx('Action', 'कार्रवाई')}</th>
                <th className="px-4 py-3">{tx('Factual Audit Detail', 'ब्योरा')}</th>
                <th className="px-4 py-3">{tx('Cryptographic Hash Seal', 'हैश सील')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {!loading && events.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-500">{tx('No activity recorded yet.', 'अभी तक कोई गतिविधि दर्ज नहीं हुई।')}</td></tr>
              )}
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-slate-900">
                    #{ev.id}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {formatDateTime(ev.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900">{ev.actorId}</span>
                    <span className="text-[11px] text-slate-500 block">{ev.actorRole}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                    {ev.entityType} <br />
                    <span className="text-slate-900 font-semibold">{ev.entityId}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                      {ev.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    {ev.details}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-slate-500 max-w-xs">
                    <div className="truncate" title={`Hash: ${ev.hash}`}>
                      <span className="text-slate-400">hash:</span> {ev.hash}
                    </div>
                    <div className="truncate text-slate-400" title={`Prev: ${ev.previousHash}`}>
                      <span className="text-slate-400">prev:</span> {ev.previousHash.substring(0, 16)}...
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {(hasMore || loading) && (
        <div className="flex justify-center">
          <button disabled={loading} onClick={() => fetchAuditLogs({ more: true })} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}{loading ? tx('Loading…', 'लोड हो रहा है…') : tx('Show older entries', 'पुरानी एंट्री दिखाएँ')}
          </button>
        </div>
      )}
    </div>
  );
};
