import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, BadgeCheck, ShieldAlert, FileSearch, UserCog, Bell, ExternalLink, Eye, EyeOff, Lock } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { ID_DOC_LABEL, type IdDocKind } from '../shared/idRules.js';
import type { UserProfile } from '../types/index.js';
import { KycRevealModal, KycVaultPanel } from './KycReveal.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-40';
const dark = `${btn} bg-slate-900 text-white`; const ghost = `${btn} border border-slate-300 bg-white text-slate-700`; const green = `${btn} bg-emerald-600 text-white`; const red = `${btn} border border-red-300 bg-white text-red-700`;
const d0 = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const ping = () => { try { window.dispatchEvent(new Event('genz:idreview-changed')); } catch { /* old browser */ } };

const FILTERS: [string, string, string, string, string][] = [
  ['todo', 'To check', 'जाँचना बाकी', 'ID not yet seen', 'ID अभी देखी नहीं'],
  ['auto', 'Auto-verified', 'ऑटो-वेरिफ़ाइड', 'verified at sign-up, ID still to check', 'साइन-अप पर वेरिफ़ाइड, ID जाँच बाकी'],
  ['mine', 'Mine', 'मेरे', 'assigned to me', 'मुझे सौंपे गए'],
  ['unassigned', 'No reviewer', 'बिना रिव्यूअर', 'nobody assigned', 'किसी को नहीं सौंपे'],
  ['asked', 'Waiting for member', 'सदस्य से इंतज़ार', 'clearer copy asked', 'साफ़ कॉपी माँगी'],
  ['done', 'Done (90 days)', 'पूरे (90 दिन)', 'decided', 'फ़ैसला हो गया'],
];

export const IdReviewView: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const tx = useTx();
  const [filter, setFilter] = useState('todo'); const [q, setQ] = useState(''); const [tier, setTier] = useState('');
  const [data, setData] = useState<any>(null); const [set, setSet] = useState<any>(null); const [err, setErr] = useState('');
  const [open, setOpen] = useState(''); const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [bulk, setBulk] = useState('');
  const say = (ok: boolean, msg: string) => { setToast({ ok, msg }); window.setTimeout(() => setToast(null), 6000); };

  const load = useCallback(() => {
    api.idQueue(filter, q, tier).then(r => { setData(r); setErr(''); }).catch(e => setErr(e.message));
    api.idSettings().then(setSet).catch(() => {});
  }, [filter, q, tier]);
  useEffect(() => { const t = window.setTimeout(load, q ? 250 : 0); return () => window.clearTimeout(t); }, [load, q]);

  const after = () => { load(); ping(); };
  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); say(true, ok); after(); } catch (e: any) { say(false, e.message || 'Failed'); }
    finally { setBusy(false); }
  };

  if (err && !data) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!data || !set) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />;
  const c = data.counts;
  const reviewers: { id: string; name: string; role: string }[] = set.reviewers || [];
  const tileCount = (id: string) => ({ todo: c.todo, auto: c.auto, mine: c.mine, unassigned: c.unassigned, asked: c.asked, done: c.done } as Record<string, number>)[id] ?? 0;

  const toggleAuto = () => {
    const on = !set.autoVerify;
    if (on && !window.confirm(tx(
      'Turn ON auto-verify?\n\nFrom now, a person registered by a RERA-registered broker who is verified and has no strikes is VERIFIED AT SIGN-UP (no waiting for admin). Their PAN / Aadhaar check then stays as an open task here and the team is notified until it is done. If the check finds a problem, suspend the person — the sponsor gets a strike.\n\nYou can turn it OFF at any time; people already verified stay verified.',
      'ऑटो-वेरिफ़ाई चालू करें?\n\nअब से जिस व्यक्ति को कोई RERA-रजिस्टर्ड, वेरिफ़ाइड और बिना स्ट्राइक वाला ब्रोकर रजिस्टर कराएगा वह साइन-अप पर ही वेरिफ़ाइड हो जाएगा (एडमिन का इंतज़ार नहीं)। उसके PAN / आधार की जाँच यहाँ खुले टास्क के रूप में रहेगी और पूरी होने तक टीम को सूचना मिलती रहेगी। जाँच में गड़बड़ मिले तो व्यक्ति को सस्पेंड करें — स्पॉन्सर को स्ट्राइक मिलेगा।\n\nकभी भी बंद कर सकते हैं; जो वेरिफ़ाइड हो चुके वे वेरिफ़ाइड ही रहेंगे।'))) return;
    run(() => api.idSettingsSave({ autoVerify: on }), on ? tx('Auto-verify is ON', 'ऑटो-वेरिफ़ाई चालू') : tx('Auto-verify is OFF', 'ऑटो-वेरिफ़ाई बंद'));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileSearch className="h-5 w-5 text-amber-500" />{tx('ID Review', 'ID जाँच')}</h2>
        <p className="text-xs text-slate-500">{tx('See the PAN / Aadhaar of new brokers and the copies they or their sponsor uploaded, mark “ID seen”, ask for a clearer copy, hand a check to a colleague — and decide whether people registered by a RERA broker are verified automatically.', 'नए ब्रोकर्स का PAN / आधार और उनकी या स्पॉन्सर की डाली कॉपी देखें, “ID देखी” मार्क करें, साफ़ कॉपी माँगें, कोई जाँच साथी को सौंपें — और तय करें कि RERA ब्रोकर के रजिस्टर किए लोग अपने-आप वेरिफ़ाइड हों या नहीं।')}</p>
      </div>
      {toast && <div role="status" className={`sticky top-2 z-30 rounded-lg px-3 py-2 text-xs font-medium shadow ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{toast.msg}</div>}

      {currentUser.role === 'SUPERADMIN' && <KycVaultPanel />}

      {/* the switch + the default reviewer */}
      <section className={`space-y-3 rounded-xl border p-3 ${set.autoVerify ? 'border-violet-300 bg-violet-50/60' : 'border-slate-200 bg-white'}`} aria-label={tx('Auto-verify settings', 'ऑटो-वेरिफ़ाई सेटिंग')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold">{tx('Auto-verify people registered by a RERA broker', 'RERA ब्रोकर के रजिस्टर किए लोग ऑटो-वेरिफ़ाई')}</h3>
            <p className="mt-0.5 text-[11px] text-slate-600">{tx('ON: the person is verified at sign-up. The ID check stays open here and the team keeps getting a notification until it is done. Needs a verified RERA sponsor with no strikes. OFF (default): an admin approves every person after seeing the ID.', 'ON: व्यक्ति साइन-अप पर ही वेरिफ़ाइड हो जाता है। ID की जाँच यहाँ खुली रहती है और पूरी होने तक टीम को सूचना मिलती रहती है। इसके लिए स्पॉन्सर का वेरिफ़ाइड RERA ब्रोकर और बिना स्ट्राइक होना ज़रूरी है। OFF (डिफ़ॉल्ट): हर व्यक्ति को एडमिन ID देखकर मंज़ूर करता है।')}</p>
            {set.changedAt && <p className="mt-0.5 text-[10px] text-slate-500">{tx('Last changed by', 'आख़िरी बदलाव')} {set.changedBy || '—'} · {d0(set.changedAt)}</p>}
          </div>
          <button role="switch" aria-checked={!!set.autoVerify} aria-label={tx('Auto-verify RERA referrals', 'RERA रेफ़रल ऑटो-वेरिफ़ाई')} disabled={busy} onClick={toggleAuto}
            className={`relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${set.autoVerify ? 'bg-violet-600' : 'bg-slate-300'}`}>
            <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${set.autoVerify ? 'translate-x-7' : 'translate-x-1'}`} />
            <span className="sr-only">{set.autoVerify ? 'ON' : 'OFF'}</span>
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-[11px] font-semibold text-slate-700"><span className="flex items-center gap-1"><UserCog className="h-3.5 w-3.5" />{tx('New ID checks go to', 'नई ID जाँच किसे जाए')}</span>
            <select className={inp + ' mt-1'} value={set.defaultAssigneeId || ''} disabled={busy} onChange={e => run(() => api.idSettingsSave({ defaultAssigneeId: e.target.value || null }), tx('Default reviewer saved', 'डिफ़ॉल्ट रिव्यूअर सेव'))}>
              <option value="">{tx('Nobody — show to all reviewers', 'कोई नहीं — सभी रिव्यूअर को दिखे')}</option>
              {reviewers.map(r => <option key={r.id} value={r.id}>{r.name} · {r.role === 'SUPERADMIN' ? 'Superadmin' : 'Admin'}</option>)}
            </select></label>
          <div className="block text-[11px] font-semibold text-slate-700">{tx('Give all unassigned checks to', 'सभी बिना-रिव्यूअर जाँच किसे दें')}
            <div className="mt-1 flex gap-2">
              <select className={inp} value={bulk} onChange={e => setBulk(e.target.value)} aria-label={tx('Reviewer', 'रिव्यूअर')}><option value="">{tx('Choose…', 'चुनें…')}</option>{reviewers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <button className={dark} disabled={!bulk || busy || c.unassigned === 0} onClick={() => run(async () => { const r = await api.idAssignAll(bulk); say(true, tx(`${r.assigned} check(s) assigned`, `${r.assigned} जाँच सौंपी`)); }, tx('Done', 'हो गया'))}>{tx('Assign', 'सौंपें')}</button>
            </div>
          </div>
        </div>
      </section>

      {set.autoVerify && c.auto > 0 && filter !== 'auto' && (
        <button onClick={() => setFilter('auto')} className="flex w-full items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 p-3 text-left text-xs font-semibold text-violet-900">
          <Bell className="h-4 w-4 shrink-0" />{tx(`${c.auto} auto-verified member(s) are waiting for their ID check — open them`, `${c.auto} ऑटो-वेरिफ़ाइड सदस्यों की ID जाँच बाकी है — खोलें`)}
        </button>
      )}

      {/* clickable tiles */}
      <section aria-label={tx('Queues', 'कतारें')} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {FILTERS.map(([id, en, hi, hint, hintHi]) => (
          <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setOpen(''); }}
            className={`min-h-16 rounded-xl border p-2 text-left ${filter === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800'}`}>
            <div className="text-xl font-bold leading-none">{tileCount(id)}</div>
            <div className="mt-1 text-[11px] font-semibold">{tx(en, hi)}</div>
            <div className={`text-[10px] ${filter === id ? 'text-slate-300' : 'text-slate-500'}`}>{tx(hint, hintHi)}</div>
          </button>
        ))}
      </section>

      <div className="flex gap-2">
        <input className={inp} placeholder={tx('Search name, city, firm, sponsor', 'नाम, शहर, फ़र्म, स्पॉन्सर खोजें')} value={q} onChange={e => setQ(e.target.value)} />
        <select className={inp + ' max-w-[8.5rem]'} value={tier} onChange={e => setTier(e.target.value)} aria-label="Tier"><option value="">{tx('All tiers', 'सभी टियर')}</option><option value="TIER1">Tier 1 (RERA)</option><option value="TIER2">Tier 2</option></select>
      </div>

      {data.tasks.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{filter === 'todo' ? tx('Nothing waiting — every ID that has been given is checked. 🎉', 'कुछ बाकी नहीं — जो भी ID दी गई है सब जाँची जा चुकी है। 🎉') : tx('Nothing here.', 'यहाँ कुछ नहीं।')}</p>}
      <div className="space-y-2">
        {data.tasks.map((t: any) => (
          <TaskCard key={t.id} t={t} reviewers={reviewers} expanded={open === t.id} meId={currentUser.id} busy={busy}
            onToggle={() => setOpen(open === t.id ? '' : t.id)}
            onAssign={(to: string) => run(() => api.idAssign(t.id, to || null), to ? tx('Handed over', 'सौंप दिया') : tx('Reviewer removed', 'रिव्यूअर हटा दिया'))}
            run={run} say={say} />
        ))}
      </div>
      {data.total > data.tasks.length && <p className="text-center text-[11px] text-slate-500">{tx(`Showing ${data.tasks.length} of ${data.total} — narrow with search.`, `${data.total} में से ${data.tasks.length} दिख रहे हैं — खोज से छाँटें।`)}</p>}
    </div>
  );
};

// ───────────────────────── one task ─────────────────────────
const statusChip = (s: string) => s === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : s === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';

const TaskCard: React.FC<{ t: any; reviewers: { id: string; name: string; role: string }[]; expanded: boolean; meId: string; busy: boolean; onToggle: () => void; onAssign: (to: string) => void; run: (fn: () => Promise<any>, ok: string) => Promise<void>; say: (ok: boolean, m: string) => void }> = ({ t, reviewers, expanded, busy, onToggle, onAssign, run, say, meId }) => {
  const tx = useTx();
  const u = t.user; const sp = t.sponsor; const info = t.idInfo;
  const active = ['OPEN', 'CHANGES_ASKED'].includes(t.status);
  const hasKind = (k: string) => t.docs.some((d: any) => d.kind === k);
  const names = new Map(reviewers.map(r => [r.id, r.name]));
  return (
    <article className={`rounded-xl border bg-white p-3 ${t.autoVerified && t.status === 'OPEN' ? 'border-violet-300' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="break-words text-sm font-bold">{u.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusChip(u.status)}`}>{u.status}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${u.tier === 'TIER1' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>{u.tier === 'TIER1' ? 'Tier 1 · RERA' : 'Tier 2'}</span>
            {t.autoVerified && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800"><BadgeCheck className="h-3 w-3" />{tx('Auto-verified', 'ऑटो-वेरिफ़ाइड')}</span>}
            {t.mismatch && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800"><ShieldAlert className="h-3 w-3" />{tx('Differs from sponsor’s details', 'स्पॉन्सर की जानकारी से अलग')}</span>}
            {t.status === 'CHANGES_ASKED' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{tx('Waiting for member', 'सदस्य से इंतज़ार')}</span>}
            {t.status === 'DONE' && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{tx('ID seen', 'ID देखी')} · {d0(t.doneAt)}</span>}
            {t.status === 'REJECTED' && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">{tx('Closed (adverse)', 'बंद (प्रतिकूल)')} · {d0(t.doneAt)}</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">{u.city || '—'}{u.company ? ` · ${u.company}` : ''} · {tx('joined', 'जुड़े')} {d0(u.joinedAt)}</div>
          <div className="text-[11px] text-slate-600">{sp ? <>{tx('Registered by', 'रजिस्टर कराया')}: <b>{sp.name}</b>{sp.company ? ` · ${sp.company}` : ''}{sp.rera ? ` · RERA ${sp.rera}` : ''}{sp.strikes ? <span className="font-bold text-red-700"> · {sp.strikes} {tx('strike(s)', 'स्ट्राइक')}</span> : null}</> : tx('No sponsor on record (added by GENZ)', 'कोई स्पॉन्सर दर्ज नहीं (GENZ ने जोड़ा)')}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            <span>PAN: <b className="font-mono">{info.pan || tx('not given', 'नहीं दिया')}</b></span>
            <span>{tx('Aadhaar', 'आधार')}: <b className="font-mono">{info.aadhaar || tx('not given', 'नहीं दिया')}</b></span>
            <span className={hasKind('PAN') ? 'font-semibold text-emerald-700' : 'text-slate-400'}>{hasKind('PAN') ? '✓' : '—'} {tx('PAN copy', 'PAN कॉपी')}</span>
            <span className={hasKind('AADHAAR') ? 'font-semibold text-emerald-700' : 'text-slate-400'}>{hasKind('AADHAAR') ? '✓' : '—'} {tx('Aadhaar copy', 'आधार कॉपी')}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {active && <select className="min-h-11 max-w-[12rem] rounded-lg border border-slate-300 px-2 text-xs" value={t.assignee?.id || ''} disabled={busy} aria-label={tx('Reviewer', 'रिव्यूअर')} onChange={e => onAssign(e.target.value)}>
          <option value="">{tx('— No reviewer —', '— कोई रिव्यूअर नहीं —')}</option>
          {t.assignee && !names.has(t.assignee.id) && <option value={t.assignee.id}>{t.assignee.name}</option>}
          {reviewers.filter(r => r.id !== u.id).map(r => <option key={r.id} value={r.id}>{r.name}{r.id === meId ? ` (${tx('me', 'मैं')})` : ''}</option>)}
        </select>}
        {!active && t.assignee && <span className="text-[11px] text-slate-500">{tx('Reviewer', 'रिव्यूअर')}: {t.assignee.name}</span>}
        <button className={expanded ? ghost : dark} onClick={onToggle} aria-expanded={expanded}>{expanded ? tx('Close', 'बंद करें') : (active ? tx('Review ID →', 'ID जाँचें →') : tx('Details', 'विवरण'))}</button>
      </div>
      {expanded && <TaskDetail t={t} active={active} run={run} say={say} />}
    </article>
  );
};

const TaskDetail: React.FC<{ t: any; active: boolean; run: (fn: () => Promise<any>, ok: string) => Promise<void>; say: (ok: boolean, m: string) => void }> = ({ t, active, run, say }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [shown, setShown] = useState<string[]>([]);
  const [ck, setCk] = useState({ pan: false, aad: false, face: false });
  const [note, setNote] = useState('');
  const [reveal, setReveal] = useState(false);
  useEffect(() => { api.idTask(t.id).then(setD).catch(e => setErr(e.message)); }, [t.id, t.updatedAt]);
  if (err) return <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{err}</p>;
  if (!d) return <Loader2 className="mx-auto mt-3 h-5 w-5 animate-spin text-slate-500" />;
  const x = d.detail; const u = d.task.user; const info = d.task.idInfo;
  const allChecked = ck.pan && ck.aad && ck.face;
  const canSeen = info.hasPan && info.hasAadhaar;
  const noteOk = note.trim().length >= 5;
  const show = (id: string) => setShown(s => s.includes(id) ? s.filter(v => v !== id) : [...s, id]);
  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      {reveal && <KycRevealModal userId={u.id} name={u.name} onClose={() => { setReveal(false); api.idTask(t.id).then(setD).catch(() => {}); }} />}
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="text-[10px] font-bold uppercase text-slate-500">{tx('Compare with the card', 'कार्ड से मिलाएँ')}</div>
          <div className="mt-1">PAN: <b className="break-all font-mono text-sm">{x.panFull || tx('not given', 'नहीं दिया')}</b></div>
          <div>{tx('Aadhaar (last 4)', 'आधार (आख़िरी 4)')}: <b className="font-mono text-sm">{info.aadhaar || tx('not given', 'नहीं दिया')}</b></div>
          <div>{tx('Name', 'नाम')}: <b>{u.name}</b></div>
          <div data-testid="vault-flags">{tx('In the KYC vault', 'KYC वॉल्ट में')}: <b>{x.vault?.hasAadhaar ? `✓ ${tx('full Aadhaar', 'पूरा आधार')}` : `— ${tx('full Aadhaar', 'पूरा आधार')}`}</b> · <b>{x.vault?.hasAddress ? `✓ ${tx('address', 'पता')}` : `— ${tx('address', 'पता')}`}</b></div>
          {x.vault?.canReveal && (x.vault.hasAadhaar || x.vault.hasAddress) && <button type="button" className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-700" onClick={() => setReveal(true)} data-testid="kyc-open-btn"><Lock className="h-4 w-4" />{tx('Open full KYC (legal)', 'पूरा KYC खोलें (क़ानूनी)')}</button>}
          {x.reraNumber && <div>RERA: <b className="font-mono">{x.reraNumber}</b></div>}
          {x.phone && <div>{tx('Phone (for the video call)', 'फ़ोन (वीडियो कॉल के लिए)')}: <a className="font-mono font-bold text-blue-700 underline" href={`tel:${x.phone}`}>{x.phone}</a></div>}
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="text-[10px] font-bold uppercase text-slate-500">{tx('What the sponsor filled in', 'स्पॉन्सर ने क्या भरा')}</div>
          {x.sponsorGave ? <div className="mt-1 space-y-0.5">
            <div>{tx('Firm', 'फ़र्म')}: <b>{x.sponsorGave.companyName || '—'}</b></div>
            <div className={x.mismatch.pan ? 'font-bold text-red-700' : ''}>PAN: <b className="font-mono">{x.sponsorGave.pan || '—'}</b>{x.mismatch.pan ? ` ⚠ ${tx('differs', 'अलग')}` : ''}</div>
            <div className={x.mismatch.aadhaar ? 'font-bold text-red-700' : ''}>{tx('Aadhaar last 4', 'आधार आख़िरी 4')}: <b className="font-mono">{x.sponsorGave.aadhaarLast4 || '—'}</b>{x.mismatch.aadhaar ? ` ⚠ ${tx('differs', 'अलग')}` : ''}</div>
          </div> : <div className="mt-1 text-slate-500">{tx('Nothing (added by GENZ or an older member)', 'कुछ नहीं (GENZ ने जोड़ा या पुराना सदस्य)')}</div>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700">{tx('Copies uploaded', 'अपलोड की गई कॉपी')}</div>
        {d.task.docs.length === 0 && <p className="text-[11px] text-slate-500">{tx('No copy uploaded. Check the original cards on a video call / at the office, or ask for a copy below.', 'कोई कॉपी नहीं डाली गई। वीडियो कॉल / ऑफ़िस में मूल कार्ड देखें, या नीचे से कॉपी माँगें।')}</p>}
        {d.task.docs.map((doc: any) => {
          const L = ID_DOC_LABEL[doc.kind as IdDocKind]; const on = shown.includes(doc.id);
          return (
            <div key={doc.id} className="rounded-lg border border-slate-200 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 text-xs"><b>{tx(L.en, L.hi)}</b><div className="text-[10px] text-slate-500">{doc.uploadedBy === 'SPONSOR' ? tx('uploaded by the sponsor', 'स्पॉन्सर ने डाली') : tx('uploaded by the member', 'सदस्य ने डाली')} · {d0(doc.createdAt)} · {Math.max(1, Math.round(doc.size / 1024))} KB</div></div>
                <div className="flex gap-2">
                  {doc.mime !== 'application/pdf' && <button className={ghost} onClick={() => show(doc.id)}>{on ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{on ? tx('Hide', 'छिपाएँ') : tx('Show here', 'यहीं दिखाएँ')}</button>}
                  <a className={ghost} href={api.idDocUrl(doc.id)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{tx('Open', 'खोलें')}</a>
                </div>
              </div>
              {on && doc.mime !== 'application/pdf' && <img src={api.idDocUrl(doc.id)} alt={tx(L.en, L.hi)} className="mt-2 max-h-80 w-full rounded border border-slate-200 bg-slate-50 object-contain" />}
            </div>);
        })}
        <p className="text-[10px] text-slate-500">{tx('Every time a copy is opened, your name is written to the audit trail. Copies are deleted 90 days after the check.', 'हर बार कॉपी खोलने पर आपका नाम ऑडिट ट्रेल में दर्ज होता है। जाँच के 90 दिन बाद कॉपी हट जाती हैं।')}</p>
      </div>

      {active && <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
        <div className="text-xs font-bold text-slate-700">{tx('Your check', 'आपकी जाँच')}</div>
        {!canSeen && <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-900">{tx('PAN or Aadhaar is not on file yet — ask the member for it below.', 'PAN या आधार अभी दर्ज नहीं है — नीचे से सदस्य से माँगें।')}</p>}
        {([['pan', 'PAN number matches the card', 'PAN नंबर कार्ड से मेल खाता है'], ['aad', 'Aadhaar last 4 digits match the card', 'आधार के आख़िरी 4 अंक कार्ड से मेल खाते हैं'], ['face', 'Name (and face on a video call) match', 'नाम (और वीडियो कॉल पर चेहरा) मेल खाता है']] as const).map(([k, en, hi]) => (
          <label key={k} className="flex min-h-9 items-center gap-2 text-xs"><input type="checkbox" checked={ck[k]} onChange={e => setCk({ ...ck, [k]: e.target.checked })} />{tx(en, hi)}</label>))}
        <textarea className={inp} rows={2} maxLength={300} placeholder={tx('Note — what you saw (“video call”, “office”, “photo clear”). For “ask again” say what is wrong. Never write a number.', 'नोट — क्या देखा (“वीडियो कॉल”, “ऑफ़िस”, “फ़ोटो साफ़”)। “दोबारा माँगें” में बताएँ क्या ग़लत है। कोई नंबर न लिखें।')} value={note} onChange={e => setNote(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button className={green} disabled={!allChecked || !canSeen} onClick={() => run(() => api.idDecide(t.id, 'SEEN', note), tx('ID marked as seen', 'ID देखी — दर्ज'))}><BadgeCheck className="h-4 w-4" />{tx('ID is fine — mark seen', 'ID ठीक है — देखी मार्क करें')}</button>
          {u.status === 'PENDING' && <button className={dark} disabled={!allChecked || !canSeen} onClick={() => run(async () => { await api.idDecide(t.id, 'SEEN', note); await api.reviewVerification(u.id, 'APPROVE', note || 'ID seen — approved from ID Review'); }, tx('ID seen and member approved', 'ID देखी और सदस्य मंज़ूर'))}>{tx('ID fine + Approve', 'ID ठीक + मंज़ूर करें')}</button>}
          <button className={ghost} disabled={!noteOk} onClick={() => run(() => api.idDecide(t.id, 'ASK_AGAIN', note), tx('Asked the member for a clearer copy', 'सदस्य से साफ़ कॉपी माँगी'))}>{tx('Ask for a clearer copy', 'साफ़ कॉपी माँगें')}</button>
          <button className={red} disabled={!noteOk} onClick={() => { const pending = u.status === 'PENDING'; if (window.confirm(pending ? tx('Reject this member? Their sponsor gets a strike only for a suspension, not a rejection.', 'इस सदस्य को अस्वीकार करें?') : tx('Suspend this member? Their sponsor gets a strike.', 'इस सदस्य को सस्पेंड करें? उनके स्पॉन्सर को स्ट्राइक मिलेगा।'))) run(() => api.reviewVerification(u.id, pending ? 'REJECT' : 'SUSPEND', note), pending ? tx('Rejected', 'अस्वीकार') : tx('Suspended — sponsor got a strike', 'सस्पेंड — स्पॉन्सर को स्ट्राइक')); }}>
            <ShieldAlert className="h-4 w-4" />{u.status === 'PENDING' ? tx('Problem — reject', 'समस्या — अस्वीकार') : tx('Problem — suspend', 'समस्या — सस्पेंड')}
          </button>
        </div>
        {!noteOk && <p className="text-[10px] text-slate-500">{tx('“Ask again” and “Problem” need a note of at least 5 letters.', '“दोबारा माँगें” और “समस्या” के लिए कम से कम 5 अक्षर का नोट चाहिए।')}</p>}
      </div>}
      {!active && d.task.note && <p className="rounded bg-slate-50 p-2 text-xs"><b>{tx('Note', 'नोट')}:</b> {d.task.note}</p>}

      <details className="text-[11px] text-slate-600">
        <summary className="cursor-pointer font-semibold">{tx('History', 'इतिहास')} ({x.history.length})</summary>
        <ul className="mt-1 space-y-0.5">{x.history.slice(0, 12).map((h: any, i: number) => <li key={i}>{d0(h.at)} · <b>{h.by}</b> · {h.action}{h.note ? ` — ${h.note}` : ''}</li>)}</ul>
      </details>
    </div>
  );
};
