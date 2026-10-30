import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, QrCode, ScanLine, ShieldCheck, Share2, XCircle, CheckCircle2, ChevronDown, Keyboard } from 'lucide-react';
import QRCode from 'qrcode';
import { qrDataUrl, drawBrandLogo } from '../lib/brandQr.js';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { QrScanner } from './QrScanner.js';
import { SiteVisitQrPassModal } from './SiteVisitQrPassModal.js';
import { VisitAckPanel } from './VisitAckPanel.js';
import { ScanPointSelect, ScanLineNote } from './ScanPoint.js';
import { normalizeCode, VISIT_RULES, MAX_PARTY } from '../shared/visitRules.js';
import type { UserProfile, SiteVisit } from '../types/index.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold disabled:opacity-40';
const dark = `${btn} bg-slate-900 text-white`;
const ghost = `${btn} border border-slate-300 bg-white text-slate-700`;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const localInput = (offsetH = 2) => { const d = new Date(Date.now() + offsetH * 3600_000); d.setMinutes(0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const STATUS_TONE: Record<string, string> = { ACTIVE: 'bg-blue-100 text-blue-800', USED: 'bg-emerald-100 text-emerald-800', EXPIRED: 'bg-slate-200 text-slate-700', CANCELLED: 'bg-red-100 text-red-700', SUPERSEDED: 'bg-slate-200 text-slate-600' };

/** One pass: QR, code, WhatsApp share, cancel. */
const PassCard: React.FC<{ p: any; onChanged: () => void }> = ({ p, onChanged }) => {
  const tx = useTx();
  const [img, setImg] = useState('');
  const [busy, setBusy] = useState(false);
  const link = `${window.location.origin}/v/${p.code}`;
  useEffect(() => { if (p.status === 'ACTIVE') qrDataUrl(p.payload, { width: 220, margin: 1 }).then(setImg).catch(() => undefined); }, [p.payload, p.status]);
  const msg = `Namaste ${p.customerName.split(' ')[0]} ji, aapka ${p.projectName} site visit pass (${when(p.scheduledAt)}). QR/code gate par photo ID ke saath dikhayein: ${link}`;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><div className="truncate text-sm font-bold">{p.customerName}</div><div className="truncate text-[11px] text-slate-500">{p.projectName} · {when(p.scheduledAt)}</div></div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[p.status]}`}>{p.status === 'ACTIVE' && p.timing === 'EXPIRED' ? 'EXPIRED' : p.status}</span>
      </div>
      {p.status === 'ACTIVE' && <div className="mt-2"><ScanLineNote kind="PASS" scanAt={p.scanAt} /></div>}
      {p.status === 'ACTIVE' && p.ackStatus && p.ackStatus !== 'ACKED' && <div className="mt-2"><VisitAckPanel kind="PASS" refId={p.id} status={p.ackStatus} buyerName={p.customerName} subject={p.projectName} canManage compact onStatus={() => onChanged()} /></div>}
      {p.status === 'ACTIVE' && p.ackStatus === 'ACKED' && <div className="mt-2"><VisitAckPanel kind="PASS" refId={p.id} status="ACKED" buyerName={p.customerName} subject={p.projectName} canManage={false} /></div>}
      {p.status === 'ACTIVE' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {img && p.ackStatus !== 'PENDING' && <img src={img} alt={tx('Visit QR', 'विज़िट QR')} className="h-28 w-28 rounded-lg border border-slate-200" />}
          <div className="min-w-0 flex-1 space-y-2">
            {p.ackStatus !== 'PENDING' && <div className="font-mono text-lg font-bold tracking-widest">{p.code}</div>}
            <div className="flex flex-wrap gap-2">
              <a className={`${dark} min-h-11`} href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><Share2 className="h-4 w-4" />{tx('Send on WhatsApp', 'WhatsApp भेजें')}</a>
              <button disabled={busy} className={ghost} onClick={async () => { setBusy(true); try { await api.visitCancel(p.id); onChanged(); } finally { setBusy(false); } }}><XCircle className="h-4 w-4" />{tx('Cancel', 'रद्द')}</button>
            </div>
          </div>
        </div>
      )}
      {p.status === 'USED' && <p className="mt-2 text-[11px] text-emerald-700">{tx('Verified', 'वेरिफाई')} {p.usedAt && when(p.usedAt)} · {p.usedByName}</p>}
    </div>
  );
};

/** Embedded in a lead drawer: issue/see passes for that lead. */
export const LeadPassPanel: React.FC<{ lead: { id: string; stage: string; associateId?: string; name: string }; currentUser: UserProfile; onChanged?: () => void }> = ({ lead, currentUser, onChanged }) => {
  const tx = useTx();
  const [me, setMe] = useState<any>(null);
  const [passes, setPasses] = useState<any[]>([]);
  const [at, setAt] = useState(localInput());
  const [size, setSize] = useState('1'); const [scanAt, setScanAt] = useState('OFFICE');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.visitPasses(lead.id).then(r => setPasses(r.passes)).catch(() => setPasses([])), [lead.id]);
  useEffect(() => { api.visitMe().then(setMe).catch(() => setMe(null)); }, []);
  const mine = me?.canIssue && (currentUser.role === 'BROKER' ? lead.associateId === currentUser.id : currentUser.role === 'DEVELOPER_BUILDER' ? !lead.associateId : true);
  useEffect(() => { if (mine) load(); }, [mine, load]);
  if (!mine || ['LOST', 'BOOKED', 'BOOKING_REQUESTED'].includes(lead.stage)) return null;
  const active = passes.find(p => p.status === 'ACTIVE');
  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
      <div className="flex items-center gap-1 text-xs font-bold text-slate-800"><QrCode className="h-3.5 w-3.5" />{tx('Site-visit QR pass', 'साइट विज़िट QR पास')}</div>
      <p className="mt-1 text-[11px] text-slate-600">{tx('Give the customer this pass. Only the builder’s team can scan it at the site — that is what proves the visit.', 'ग्राहक को यह पास दें। इसे सिर्फ़ बिल्डर की टीम साइट पर स्कैन कर सकती है — यही विज़िट का सबूत है।')}</p>
      {active && <div className="mt-2"><PassCard p={active} onChanged={() => { load(); onChanged?.(); }} /></div>}
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
        <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className={inp} />
        <input inputMode="numeric" value={size} onChange={e => setSize(e.target.value)} className={inp} aria-label={tx('people', 'लोग')} />
      </div>
      <div className="mt-2"><ScanPointSelect kind="PASS" value={scanAt} onChange={setScanAt} /></div>
      {err && <p className="mt-1 text-[11px] text-red-700">{err}</p>}
      <button disabled={busy} className={`${dark} mt-2 w-full`} onClick={async () => {
        setBusy(true); setErr('');
        try { await api.visitIssue({ leadId: lead.id, scheduledAt: new Date(at).toISOString(), partySize: Math.min(MAX_PARTY, Math.max(1, Number(size) || 1)), scanAt }); await load(); onChanged?.(); }
        catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}{active ? tx('Re-issue (replaces old pass)', 'नया पास (पुराना रद्द)') : tx('Create visit pass', 'विज़िट पास बनाएँ')}</button>
    </div>
  );
};

/** Scanner flow for the builder side. */
const ScanDesk: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const tx = useTx();
  const [cam, setCam] = useState(false);
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');
  const [prev, setPrev] = useState<any>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [idOk, setIdOk] = useState(false);
  const [size, setSize] = useState(''); const [note, setNote] = useState('');
  const [result, setResult] = useState<any>(null);

  const lookup = async (raw: string) => {
    const c = normalizeCode(raw);
    setErr(''); setPrev(null); setResult(null); setIdOk(false); setCam(false);
    if (!c && /"visitId"\s*:/.test(String(raw))) { setErr(tx('This is a broker-to-broker property visit QR — not a project pass. It is scanned by the property’s owner or listing broker, not here.', 'यह ब्रोकर-से-ब्रोकर प्रॉपर्टी विज़िट का QR है — प्रोजेक्ट पास नहीं। इसे प्रॉपर्टी का मालिक या लिस्टिंग ब्रोकर स्कैन करता है, यहाँ नहीं।')); return; }
    if (!c) { setErr(tx('That is not a GENZ visit pass. Ask the visitor to open their pass link again.', 'यह GENZ विज़िट पास नहीं है। विज़िटर से पास लिंक दोबारा खुलवाएँ।')); return; }
    setBusy(true);
    try { const r = await api.visitPreview(c); setCode(c); setPrev(r); setSize(r.pass.partySize ? String(r.pass.partySize) : ''); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  // v45: opened from the header Scan with a builder pass → look it up at once
  useEffect(() => {
    try {
      const u = new URL(window.location.href); const c = u.searchParams.get('pass');
      if (c) { u.searchParams.delete('pass'); window.history.replaceState(null, '', u.toString()); void lookup(c); }
    } catch { /* old browser */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const confirm = async () => {
    setBusy(true); setErr('');
    try { const r = await api.visitConfirm(code, { idChecked: true, partySize: size ? Number(size) : undefined, note: note || undefined }); setResult(r); setPrev(null); setTyped(''); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold"><ScanLine className="h-4 w-4" />{tx('Scan a visit pass', 'विज़िट पास स्कैन करें')}</h3>
      {!cam && <button className={`${dark} w-full`} onClick={() => { setCam(true); setErr(''); setResult(null); setPrev(null); }}><ScanLine className="h-4 w-4" />{tx('Scan QR', 'QR स्कैन करें')}</button>}
      {cam && <QrScanner onResult={lookup} onClose={() => setCam(false)} />}
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); lookup(typed); }}>
        <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={tx('Type code', 'कोड लिखें')} className={`${inp} font-mono uppercase`} maxLength={40} autoCapitalize="characters" />
        <button className={ghost} disabled={!typed.trim() || busy} type="submit"><Keyboard className="h-4 w-4" />{tx('Check', 'जाँचें')}</button>
      </form>
      {busy && !prev && <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500" />}
      {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">{err}</p>}
      {result && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status"><CheckCircle2 className="mb-1 h-5 w-5" /><b>{tx('Visit verified', 'विज़िट वेरिफाई हुई')}</b> — {tx('lead moved to Site visited.', 'लीड “साइट विज़िटेड” में गई।')}{result.pointsAwarded ? ` ${tx('Partner earned points.', 'पार्टनर को पॉइंट मिले।')}` : ''}</div>}
      {prev && (
        <div className="space-y-3 rounded-xl border-2 border-slate-900 p-3">
          <div><div className="text-[10px] font-bold uppercase text-slate-500">{tx('Visitor — check against photo ID', 'विज़िटर — फ़ोटो ID से मिलाएँ')}</div>
            <div className="text-xl font-bold">{prev.pass.customerName}</div>
            <div className="text-xs text-slate-600">{tx('Phone ends with', 'फ़ोन के अंतिम अंक')} <b>••••{prev.pass.phoneLast4}</b></div></div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-500">{tx('Project', 'प्रोजेक्ट')}</span><br /><b>{prev.pass.projectName}</b></div>
            <div><span className="text-slate-500">{tx('Slot', 'समय')}</span><br /><b>{when(prev.pass.scheduledAt)}</b></div>
            <div><span className="text-slate-500">{tx('Referred by', 'रेफ़र किया')}</span><br /><b>{prev.pass.referredBy}</b>{prev.pass.referredByCompany && <span className="block text-[10px] text-slate-500">{prev.pass.referredByCompany}</span>}</div>
            <div><span className="text-slate-500">{tx('Lead stage', 'लीड स्टेज')}</span><br /><b>{prev.pass.leadStage.replace(/_/g, ' ')}</b></div>
          </div>
          {prev.warnings.map((w: string) => <p key={w} className="rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">⚠ {w}</p>)}
          {prev.canConfirm && <>
            <label className="flex min-h-11 items-start gap-2 text-xs font-semibold"><input type="checkbox" checked={idOk} onChange={e => setIdOk(e.target.checked)} className="mt-0.5 h-5 w-5" />{tx('I checked the visitor’s photo ID and the name matches', 'मैंने विज़िटर की फ़ोटो ID देखी और नाम मिलता है')}</label>
            <div className="grid grid-cols-[5rem_1fr] gap-2"><input inputMode="numeric" value={size} onChange={e => setSize(e.target.value)} placeholder={tx('People', 'लोग')} className={inp} /><input value={note} onChange={e => setNote(e.target.value)} placeholder={tx('Note (optional)', 'नोट (वैकल्पिक)')} className={inp} maxLength={200} /></div>
            <button disabled={!idOk || busy} className={`${dark} w-full`} onClick={confirm}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{tx('Confirm visit', 'विज़िट कन्फ़र्म करें')}</button>
          </>}
        </div>
      )}
    </section>
  );
};

const RulesCard: React.FC = () => {
  const tx = useTx(); const [open, setOpen] = useState(false);
  const { t } = { t: tx };
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between px-4 text-left text-sm font-bold">{t('Who creates, who scans — the rules', 'कौन बनाता है, कौन स्कैन करता है — नियम')}<ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} /></button>
      {open && <div className="space-y-2 border-t border-slate-100 p-3">
        {VISIT_RULES.map(r => (
          <div key={r.who.en} className="rounded-lg bg-slate-50 p-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">{t(r.who.en, r.who.hi)}
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${r.create ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-500'}`}>{r.create ? t('can create', 'बना सकता') : t('cannot create', 'नहीं बना सकता')}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${r.scan ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'}`}>{r.scan ? t('can scan', 'स्कैन कर सकता') : t('cannot scan', 'स्कैन नहीं')}</span></div>
            <p className="mt-1 text-[11px] text-slate-600">{t(r.en, r.hi)}</p>
          </div>
        ))}
        <p className="text-[11px] text-slate-500">{t('Every pass: one customer, one use, valid from 2 h before to 10 h after the slot. Every issue, scan and cancel is audit-logged.', 'हर पास: एक ग्राहक, एक बार, स्लॉट से 2 घंटे पहले से 10 घंटे बाद तक। हर बनाना, स्कैन और रद्द ऑडिट में दर्ज होता है।')}</p>
      </div>}
    </section>
  );
};

/** v32 — broker-to-broker (co-broking) visits from Deal Rooms: show the QR pass / scan or OTP-verify, right here. */
const BrokerVisits: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const tx = useTx();
  const [visits, setVisits] = useState<SiteVisit[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<SiteVisit | null>(null);
  const [cam, setCam] = useState(false); const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // v34 — scan a visitor's QR here: say plainly when it is not a GENZ visit QR, a builder pass, or simply not yours
  const onScan = (raw: string) => {
    setCam(false);
    const t = String(raw || '').trim();
    if (/^GENZV:/i.test(t) || /\/v\/[A-Za-z0-9]{10}/.test(t)) return setScanMsg({ ok: false, text: tx('This is a builder-project visit pass — only that builder’s team can scan it, at the project. It is not for broker-to-broker visits.', 'यह बिल्डर-प्रोजेक्ट का विज़िट पास है — इसे सिर्फ़ उसी बिल्डर की टीम प्रोजेक्ट पर स्कैन कर सकती है। यह ब्रोकर-से-ब्रोकर विज़िट का नहीं है।') });
    let j: any = null; try { j = JSON.parse(t); } catch { /* not json */ }
    if (!j || typeof j.visitId !== 'string' || !String(j.token || '').startsWith('VISIT-PASS-')) return setScanMsg({ ok: false, text: tx('This is not a GENZ visit QR. Ask the buyer to open his pass from the GENZ link again.', 'यह GENZ का विज़िट QR नहीं है। खरीदार से GENZ लिंक से अपना पास दोबारा खुलवाएँ।') });
    const v = (visits || []).find(x => x.id === j.visitId);
    if (!v) return setScanMsg({ ok: false, text: tx('This is a GENZ visit QR, but NOT yours — it is not a visit you booked and not one on your property, so you cannot scan it.', 'यह GENZ का विज़िट QR है, पर आपका नहीं — न यह आपकी बुक की हुई विज़िट है, न आपकी प्रॉपर्टी की, इसलिए आप इसे स्कैन नहीं कर सकते।') });
    if (v.isVerified) return setScanMsg({ ok: false, text: tx('This visit is already verified.', 'यह विज़िट पहले ही वेरिफाई हो चुकी है।') });
    if (v.brokerId === currentUser.id) return setScanMsg({ ok: false, text: tx('You booked this visit, so you cannot verify it yourself — the owner or the listing broker scans the buyer’s QR.', 'यह विज़िट आपने बुक की है, इसलिए आप खुद वेरिफाई नहीं कर सकते — खरीदार का QR मालिक या लिस्टिंग ब्रोकर स्कैन करेगा।') });
    setScanMsg(null); setOpen(v);
  };
  const load = useCallback(() => {
    api.getSiteVisits().then(r => setVisits(r.siteVisits || [])).catch(() => setVisits([]));
    api.getProperties({ limit: 200 }).then(r => setTitles(Object.fromEntries((r.properties || []).map(x => [x.id, x.title])))).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (visits === null) return null;
  const pending = visits.filter(v => !v.isVerified).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  const done = visits.filter(v => v.isVerified).sort((a, b) => (b.verifiedAt || '').localeCompare(a.verifiedAt || '')).slice(0, 10);
  const row = (v: SiteVisit) => (
    <div key={v.id} data-testid={`bvisit-${v.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
      <div className="min-w-0"><div className="truncate font-bold">{v.customerName}</div>
        <div className="truncate text-slate-500">{titles[v.propertyId] || v.propertyId} · {when(v.scheduledTime)}</div></div>
      {!v.isVerified && v.ackStatus === 'PENDING' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900" data-testid={`bvisit-ack-${v.id}`}>{tx('Buyer not confirmed yet', 'खरीदार की पुष्टि बाकी')}</span>}
      {v.isVerified
        ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{tx('Verified', 'वेरिफाई')} · {v.verificationMethod}</span>
        : <button className={`${dark} !min-h-11 !px-3 !text-xs`} onClick={() => setOpen(v)}><ScanLine className="h-4 w-4" />{tx('QR pass / Scan', 'QR पास / स्कैन')}</button>}
    </div>
  );
  return (
    <section className="space-y-2" data-testid="broker-visits">
      <h3 className="flex items-center gap-2 text-sm font-bold"><ScanLine className="h-4 w-4" />{tx('Broker-to-broker visits', 'ब्रोकर-से-ब्रोकर विज़िट')} ({pending.length})</h3>
      <p className="text-[11px] text-slate-500">{tx('When your customer sees another broker’s property (or the reverse) from a Deal Room: open the pass, or scan the customer’s QR / enter the OTP on location.', 'जब आपका ग्राहक किसी और ब्रोकर की प्रॉपर्टी देखता है (या उल्टा) — डील रूम से: पास खोलें, या मौके पर ग्राहक का QR स्कैन / OTP डालें।')}</p>
      <div className="space-y-2" data-testid="broker-scan">
        {!cam && <button type="button" className={`${ghost} w-full`} onClick={() => { setCam(true); setScanMsg(null); }} data-testid="broker-scan-btn"><ScanLine className="h-4 w-4" />{tx('Scan a buyer’s QR (on the property)', 'खरीदार का QR स्कैन करें (प्रॉपर्टी पर)')}</button>}
        {cam && <QrScanner onResult={onScan} onClose={() => setCam(false)} />}
        {scanMsg && <p role="alert" className={`rounded-lg p-2 text-xs font-semibold ${scanMsg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} data-testid="broker-scan-msg">{scanMsg.text}</p>}
      </div>
      {pending.length === 0 && <p className="text-xs text-slate-500">{tx('No visit waiting. Schedule one from a Deal Room.', 'कोई विज़िट बाकी नहीं। डील रूम से तय करें।')}</p>}
      {pending.map(row)}
      {done.length > 0 && <><h4 className="pt-1 text-xs font-bold text-slate-600">{tx('Recently verified', 'हाल में वेरिफाई')}</h4>{done.map(row)}</>}
      {open && <SiteVisitQrPassModal isOpen visit={open} dealId={open.dealRoomId} currentUser={currentUser} onClose={() => setOpen(null)} onSuccess={() => { setOpen(null); load(); }} />}
    </section>
  );
};

export const VisitsView: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const tx = useTx();
  const [me, setMe] = useState<any>(null);
  const [passes, setPasses] = useState<any[]>([]);
  const [board, setBoard] = useState<any>({ expected: [], done: [] });
  const [leads, setLeads] = useState<any[]>([]);
  const [leadId, setLeadId] = useState(''); const [at, setAt] = useState(localInput()); const [size, setSize] = useState('1'); const [scanAt, setScanAt] = useState('OFFICE');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const m = await api.visitMe(); setMe(m);
    if (m.canIssue) {
      const [p, l] = await Promise.all([api.visitPasses(), api.crmLeads()]);
      setPasses(p.passes);
      setLeads(l.leads.filter((x: any) => !['LOST', 'BOOKED', 'BOOKING_REQUESTED'].includes(x.stage) && x.verify !== 'REJECTED'
        && (currentUser.role === 'DEVELOPER_BUILDER' ? !x.associateId : currentUser.role === 'BROKER' ? x.associateId === currentUser.id : true)));
    }
    if (m.canScan) setBoard(await api.visitBoard());
  }, [currentUser.id, currentUser.role]);
  useEffect(() => { load().catch(e => setErr(e.message)); }, [load]);

  if (!me) return err ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p> : <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-bold text-slate-900">{tx('Visit QR', 'विज़िट QR')}</h2>
        <p className="text-xs text-slate-500">{currentUser.role === 'BROKER'
          ? tx('Proof that a customer really visited — builder projects (you create, builder scans) and broker-to-broker visits (scan / OTP on location).', 'ग्राहक सच में आया — इसका सबूत। बिल्डर प्रोजेक्ट (आप बनाते हैं, बिल्डर स्कैन करता है) और ब्रोकर-से-ब्रोकर विज़िट (मौके पर स्कैन / OTP)।')
          : tx('Proof that a customer really visited the site — created by the partner, scanned by the builder.', 'ग्राहक सच में साइट पर आया — इसका सबूत। पार्टनर बनाता है, बिल्डर स्कैन करता है।')}</p></div>
      {currentUser.role === 'BROKER' && <BrokerVisits currentUser={currentUser} />}
      <RulesCard />
      {!me.canIssue && !me.canScan && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tx('Your account cannot create or scan visit passes. Ask your employer to switch “Can scan visit QR” on for you.', 'आपका अकाउंट विज़िट पास बना या स्कैन नहीं कर सकता। अपने नियोक्ता से “विज़िट QR स्कैन” चालू करवाएँ।')}</p>}
      {me.canScan && <>
        <ScanDesk onDone={() => load().catch(() => undefined)} />
        <section className="space-y-2">
          <h3 className="text-sm font-bold">{tx('Expected now', 'अभी अपेक्षित')} ({board.expected.length})</h3>
          {board.expected.length === 0 && <p className="text-xs text-slate-500">{tx('No pending passes for today.', 'आज कोई पेंडिंग पास नहीं।')}</p>}
          {board.expected.map((p: any) => <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs"><div className="min-w-0"><div className="truncate font-bold">{p.customerName} <span className="font-normal text-slate-500">••••{p.phoneLast4}</span></div><div className="truncate text-slate-500">{p.projectName} · {when(p.scheduledAt)} · {tx('via', 'द्वारा')} {p.associateName}</div></div><span className="font-mono text-slate-400">…{p.codeTail}</span></div>)}
          <h3 className="pt-2 text-sm font-bold">{tx('Verified today', 'आज वेरिफाई')} ({board.done.length})</h3>
          {board.done.map((p: any) => <div key={p.id} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs"><b>{p.customerName}</b> · {p.projectName} · {tx('by', 'द्वारा')} {p.usedByName} · {p.associateName}</div>)}
        </section>
      </>}
      {me.canIssue && <>
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><QrCode className="h-4 w-4" />{tx('Create a visit pass', 'विज़िट पास बनाएँ')}</h3>
          <select value={leadId} onChange={e => setLeadId(e.target.value)} className={inp}><option value="">{tx('Choose a customer…', 'ग्राहक चुनें…')}</option>{leads.map(l => <option key={l.id} value={l.id}>{l.name} — {l.projectName}</option>)}</select>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2"><input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className={inp} /><input inputMode="numeric" value={size} onChange={e => setSize(e.target.value)} className={inp} aria-label={tx('people', 'लोग')} /></div>
          <ScanPointSelect kind="PASS" value={scanAt} onChange={setScanAt} />
          {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
          <button disabled={!leadId || busy} className={`${dark} w-full`} onClick={async () => {
            setBusy(true); setErr('');
            try { await api.visitIssue({ leadId, scheduledAt: new Date(at).toISOString(), partySize: Math.min(MAX_PARTY, Math.max(1, Number(size) || 1)), scanAt }); setLeadId(''); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
          }}>{tx('Create pass', 'पास बनाएँ')}</button>
        </section>
        <section className="space-y-2"><h3 className="text-sm font-bold">{tx('My passes', 'मेरे पास')}</h3>
          {passes.length === 0 && <p className="text-xs text-slate-500">{tx('No passes yet.', 'अभी कोई पास नहीं।')}</p>}
          {passes.map(p => <PassCard key={p.id} p={p} onChanged={() => load().catch(() => undefined)} />)}
        </section>
      </>}
    </div>
  );
};
