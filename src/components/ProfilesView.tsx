import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, Star, ShieldCheck, ArrowLeft, Flag, MessageSquareReply, Pencil, Trash2, BadgeCheck, Camera, Lock } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { TAGS, REPORT_REASONS, REMARK_MAX, REPLY_MAX, ABOUT_MAX, tagLabel, type TargetGroup } from '../shared/reviewRules.js';

/**
 * v78 — Profiles & Reviews. One tab for everyone:
 *   Find     — search a person (name / firm / area, or an exact mobile / GZ code); open his profile, read the rating and the reviews,
 *              write a review if you really worked together (the server checks that), reply to yours, report a review
 *   My profile — what others see about me, who said what, and the reviews I wrote
 *   Reports  — GENZ staff only: reported reviews, hide / keep / restore
 */
const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold disabled:opacity-50';
const dark = `${btn} bg-slate-900 text-white`;
const ghost = `${btn} border border-slate-300 bg-white text-slate-700`;
const PRO_VIEWERS = ['BROKER', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL', 'TEAM_MEMBER', 'ADMIN', 'SUPERADMIN'];

const Stars: React.FC<{ value: number; size?: string }> = ({ value, size = 'h-4 w-4' }) => (
  <span className="inline-flex" aria-label={`${value} / 5`}>
    {[1, 2, 3, 4, 5].map(i => <Star key={i} className={`${size} ${value >= i - 0.25 ? 'fill-amber-400 text-amber-400' : value >= i - 0.75 ? 'fill-amber-200 text-amber-300' : 'text-slate-300'}`} />)}
  </span>
);
const Chip: React.FC<{ tone?: 'green' | 'red' | 'slate' | 'amber' | 'blue'; children: React.ReactNode }> = ({ tone = 'slate', children }) => {
  const c = { green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-700', slate: 'bg-slate-100 text-slate-600', amber: 'bg-amber-100 text-amber-800', blue: 'bg-sky-100 text-sky-800' }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
};
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const day = (iso: string, hi: boolean) => new Date(iso).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const Avatar: React.FC<{ card: any; size?: string }> = ({ card, size = 'h-12 w-12' }) => (
  card.photoUrl
    ? <img src={card.photoUrl} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
    : <span className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-amber-300`} aria-hidden>{initials(card.name)}</span>
);

const RatingLine: React.FC<{ r: any }> = ({ r }) => {
  const tx = useTx();
  return r.count
    ? <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-slate-600"><Stars value={r.avg} /><b className="text-slate-900">{r.avg.toFixed(1)}</b>({r.count}{r.early ? ` · ${tx('early', 'शुरुआती')}` : ''})</span>
    : <span className="text-xs text-slate-400">{tx('No reviews yet', 'अभी कोई रिव्यू नहीं')}</span>;
};

const PersonRow: React.FC<{ card: any; onOpen: () => void }> = ({ card, onOpen }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  return (
    <button type="button" onClick={onOpen} data-testid="person-row" className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-slate-400">
      <Avatar card={card} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-900">{card.name}</span>
        <span className="block truncate text-xs text-slate-500">{hi ? card.groupLabel.hi : card.groupLabel.en}{card.firm ? ` · ${card.firm}` : ''}{card.city ? ` · ${card.city}` : ''}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {card.status !== 'ACTIVE' ? <Chip tone="red">{tx('Not an active member', 'सक्रिय सदस्य नहीं')}</Chip> : <RatingLine r={card.rating} />}
          {card.checks?.idChecked && <Chip tone="green">{tx('ID checked', 'ID जाँचा')}</Chip>}
        </span>
      </span>
    </button>
  );
};

/** v80 — the owner on this broker's own listing / mandate who has no GENZ login: shown as a record, never as a member (no profile, no rating to open) */
const OwnerRecordCard: React.FC<{ rec: { name: string; last4: string; city: string; listings: { propertyId: string; title: string; mandateId?: string; mandateStatus?: string }[] } }> = ({ rec }) => {
  const tx = useTx();
  const mstat = (x?: string) => x === 'ACTIVE' ? tx('mandate active', 'मैंडेट चालू') : x === 'PENDING_BROKER' ? tx('mandate waiting for you', 'मैंडेट आपके साइन का इंतज़ार') : x ? tx('mandate ' + x.toLowerCase().replace('_', ' '), 'मैंडेट: ' + x) : '';
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3" data-testid="people-owner-record">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-amber-300" aria-hidden>{initials(rec.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900">{rec.name} <span className="font-mono text-xs font-normal text-slate-500">••{rec.last4}</span></span>
          <span className="block truncate text-xs text-slate-500">{tx('Owner', 'ओनर')}{rec.city ? ` · ${rec.city}` : ''}</span>
          <span className="mt-0.5"><Chip tone="amber">{tx('Owner on your listing · not on GENZ yet', 'आपकी लिस्टिंग का ओनर · अभी GENZ पर नहीं')}</Chip></span>
        </span>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-slate-700">{rec.listings.map(l => <li key={l.propertyId} className="truncate" data-testid="people-owner-record-listing">🏠 {l.title}{l.mandateId ? ` · ${l.mandateId} ${mstat(l.mandateStatus)}` : ''}</li>)}</ul>
      <p className="mt-2 text-[11px] text-slate-500">{tx('He has no GENZ login, so there is no profile or rating to open. This is the owner you entered, or who signed your mandate.', 'इनका GENZ लॉगिन नहीं है, इसलिए खोलने के लिए प्रोफ़ाइल या रेटिंग नहीं है। यह वही ओनर है जिसे आपने जोड़ा, या जिसने आपका मैंडेट साइन किया।')}</p>
    </div>
  );
};

// ───────── find ─────────
const FindTab: React.FC<{ role: string; onOpen: (id: string, ticket?: string) => void }> = ({ role, onOpen }) => {
  const tx = useTx();
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [res, setRes] = useState<{ kind: string; results: any[]; hint?: string; hi?: string; ownerRecord?: { name: string; last4: string; city: string; listings: { propertyId: string; title: string; mandateId?: string; mandateStatus?: string }[] } } | null>(null);
  const { lang } = useI18n();
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { setRes(await api.profSearch(q)); } catch (x: any) { setErr(x.message); setRes(null); } finally { setBusy(false); }
  };
  const pro = PRO_VIEWERS.includes(role);
  return (
    <div className="space-y-3">
      <form onSubmit={go} className="space-y-2" role="search">
        <label className="block text-xs font-semibold text-slate-700">{tx('Find a person or a firm', 'किसी व्यक्ति या फ़र्म को ढूँढें')}</label>
        <div className="flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} maxLength={40} className={inp} data-testid="people-q" inputMode="search"
            placeholder={tx('Name, firm, area, GZ code or mobile number', 'नाम, फ़र्म, इलाका, GZ कोड या मोबाइल नंबर')} />
          <button type="submit" disabled={busy || q.trim().length < 3} className={dark} data-testid="people-go">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{tx('Search', 'खोजें')}</button>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500"><Lock className="mt-0.5 h-3 w-3 shrink-0" />
          {pro
            ? tx('To check a customer or an owner, type his full 10-digit mobile number or GZ code. Names of customers and owners are never listed.', 'किसी ग्राहक या ओनर को जाँचने के लिए उसका पूरा 10 अंकों का मोबाइल नंबर या GZ कोड लिखें। ग्राहक और ओनर के नाम कभी लिस्ट में नहीं दिखते।')
            : tx('Search brokers, builders, contractors and counsel by name, firm or area — or anyone by their GZ code. Profiles show only when you search.', 'ब्रोकर, बिल्डर, ठेकेदार और वकील को नाम, फ़र्म या इलाके से ढूँढें। प्रोफ़ाइल सिर्फ़ सर्च करने पर दिखती है।')}
        </p>
      </form>
      {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{err}</p>}
      {res && res.hint && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{lang === 'hi' ? res.hi : res.hint}</p>}
      {res && !res.hint && res.results.length === 0 && !res.ownerRecord && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500" data-testid="people-empty">
          {res.kind === 'PHONE' || res.kind === 'CODE'
            ? tx('No GENZ member found for this. That is not proof of anything — only that this number / code is not on GENZ.', 'इसके लिए कोई GENZ सदस्य नहीं मिला। इसका मतलब सिर्फ़ इतना है कि यह नंबर / कोड GENZ पर नहीं है।')
            : tx('Nobody found. Try fewer words or another spelling.', 'कोई नहीं मिला। कम शब्द या दूसरी वर्तनी आज़माएँ।')}
        </p>
      )}
      {res?.ownerRecord && <OwnerRecordCard rec={res.ownerRecord} />}
      <div className="space-y-2" data-testid="people-results">{res?.results.map(c => <PersonRow key={c.id} card={c} onOpen={() => onOpen(c.id, c.ticket)} />)}</div>
    </div>
  );
};

// ───────── a review ─────────
const ReviewCard: React.FC<{ rv: any; group: TargetGroup; onChanged: () => void; target?: any; canReply?: boolean; onEdit?: () => void }> = ({ rv, group, onChanged, target, canReply, onEdit }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [replying, setReplying] = useState(false); const [text, setText] = useState(rv.reply?.text || '');
  const [reporting, setReporting] = useState(false); const [reason, setReason] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState('');
  const run = async (fn: () => Promise<any>, ok?: string) => { setBusy(true); setErr(''); try { await fn(); if (ok) setDone(ok); onChanged(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className={`rounded-xl border p-3 ${rv.status === 'HIDDEN' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`} data-testid="review-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Stars value={rv.rating} />
          {(() => {
            // on a profile: who wrote it. In "reviews you wrote" and on the staff desk: who it is about (and, for staff, who wrote it)
            const who = target ? target : rv.reviewer;
            return (
              <p className={`mt-0.5 text-xs font-semibold text-slate-800 ${target ? 'break-words' : 'truncate'}`}>
                {target ? (rv.mine ? <>{tx('About', 'किसके बारे में')} {target.name}</> : <>{rv.reviewer.name} → {target.name}</>) : rv.reviewer.name}
                <span className="font-normal text-slate-500"> · {hi ? who.groupLabel.hi : who.groupLabel.en}{who.city ? `, ${who.city}` : ''}</span>
              </p>
            );
          })()}
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">{day(rv.at, hi)}{rv.editedAt ? ` · ${tx('edited', 'बदला')}` : ''}</span>
      </div>
      {rv.tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{rv.tags.map((t: string) => <Chip key={t} tone={TAGS[group].find(x => x.id === t)?.tone === 'NEG' ? 'red' : 'green'}>{tagLabel(group, t, hi)}</Chip>)}</div>}
      {rv.remark && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-800">{rv.remark}</p>}
      <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500"><BadgeCheck className="h-3 w-3 text-emerald-600" />{tx('Worked together on', 'साथ काम किया:')} {hi ? rv.worked.hi : rv.worked.en}
        {rv.disputed && <Chip tone="amber">{tx('Disputed — GENZ is checking', 'विवादित — GENZ जाँच रही है')}</Chip>}</p>
      {rv.status === 'HIDDEN' && <p className="mt-1.5 text-xs font-semibold text-red-700">{tx('Removed by GENZ', 'GENZ ने हटाया')}{rv.hiddenReason ? `: ${rv.hiddenReason}` : ''}</p>}
      {rv.reply && !replying && <div className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700"><p className="text-[11px] font-semibold text-slate-500">{tx('Reply', 'जवाब')} · {day(rv.reply.at, hi)}</p><p className="whitespace-pre-wrap break-words">{rv.reply.text}</p></div>}
      {replying && (
        <div className="mt-2 space-y-2">
          <textarea value={text} onChange={e => setText(e.target.value)} maxLength={REPLY_MAX} rows={3} className={inp} data-testid="reply-text" placeholder={tx('Your public reply (no links or phone numbers)', 'आपका सार्वजनिक जवाब (लिंक या फ़ोन नंबर नहीं)')} />
          <div className="flex gap-2"><button type="button" disabled={busy || text.trim().length < 2} className={dark} data-testid="reply-send" onClick={() => run(() => api.profReply(rv.id, text.trim()).then(() => setReplying(false)))}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('Post reply', 'जवाब दें')}</button><button type="button" className={ghost} onClick={() => setReplying(false)}>×</button></div>
        </div>
      )}
      {reporting && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
          <select value={reason} onChange={e => setReason(e.target.value)} className={inp} aria-label={tx('Why are you reporting this?', 'आप इसे रिपोर्ट क्यों कर रहे हैं?')} data-testid="report-reason">
            <option value="">{tx('Why are you reporting this?', 'आप इसे रिपोर्ट क्यों कर रहे हैं?')}</option>
            {REPORT_REASONS.map(x => <option key={x.id} value={x.id}>{hi ? x.hi : x.en}</option>)}
          </select>
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} className={inp} placeholder={tx('A line for GENZ (optional)', 'GENZ के लिए एक पंक्ति (वैकल्पिक)')} />
          <div className="flex gap-2"><button type="button" disabled={busy || !reason} className={dark} data-testid="report-send" onClick={() => run(() => api.profReport(rv.id, reason, note).then(() => setReporting(false)), tx('Reported — GENZ will look at it.', 'रिपोर्ट हो गई — GENZ देखेगी।'))}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('Send report', 'रिपोर्ट भेजें')}</button><button type="button" className={ghost} onClick={() => setReporting(false)}>×</button></div>
        </div>
      )}
      {err && <p className="mt-1.5 text-xs text-red-700" role="alert">{err}</p>}
      {done && <p className="mt-1.5 text-xs text-emerald-700">{done}</p>}
      {rv.status === 'VISIBLE' && (
        <div className="mt-1 flex flex-wrap gap-1">
          {canReply && rv.aboutMe && !replying && <button type="button" className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold text-slate-700 underline" data-testid="reply-open" onClick={() => setReplying(true)}><MessageSquareReply className="h-3.5 w-3.5" />{rv.reply ? tx('Change reply', 'जवाब बदलें') : tx('Reply', 'जवाब दें')}</button>}
          {!rv.mine && !rv.reported && !reporting && <button type="button" className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold text-slate-500 underline" data-testid="report-open" onClick={() => setReporting(true)}><Flag className="h-3.5 w-3.5" />{tx('Report', 'रिपोर्ट')}</button>}
          {rv.mine && rv.editable && onEdit && <button type="button" className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold text-slate-700 underline" data-testid="review-edit" onClick={onEdit}><Pencil className="h-3.5 w-3.5" />{tx('Edit', 'बदलें')}</button>}
        </div>
      )}
    </div>
  );
};

const StarPick: React.FC<{ value: number; onChange: (n: number) => void }> = ({ value, onChange }) => {
  const tx = useTx();
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={tx('Your rating', 'आपकी रेटिंग')}>
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i}`} onClick={() => onChange(i)} data-testid={`star-${i}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-slate-50">
          <Star className={`h-7 w-7 ${value >= i ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
        </button>
      ))}
    </div>
  );
};

const ReviewForm: React.FC<{ targetId: string; group: TargetGroup; state: any; existing: any; onDone: () => void; onCancel: () => void }> = ({ targetId, group, state, existing, onDone, onCancel }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [rating, setRating] = useState<number>(existing?.rating || 0);
  const [tags, setTags] = useState<string[]>(existing?.tags || []);
  const [remark, setRemark] = useState(existing?.remark || '');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const toggle = (id: string) => setTags(t => t.includes(id) ? t.filter(x => x !== id) : t.length >= 4 ? t : [...t, id]);
  const send = async () => {
    setBusy(true); setErr('');
    try { await api.profReview(targetId, { rating, tags, remark: remark.trim() }); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-white p-3" data-testid="review-form">
      <p className="text-xs text-slate-500">{state?.proof ? tx('You can review because you worked together on', 'आप इसलिए रिव्यू दे सकते हैं क्योंकि आपने साथ काम किया:') : ''} {state?.proof ? <b className="text-slate-700">{hi ? ({ DEAL: 'डील रूम', PARTNERSHIP: 'प्रोजेक्ट पार्टनरशिप', OWNER_MANDATE: 'ओनर मैंडेट', CONSTRUCTION: 'निर्माण का काम', LEGAL: 'क़ानूनी केस' } as any)[state.proof.kind] : ({ DEAL: 'a deal room', PARTNERSHIP: 'a project partnership', OWNER_MANDATE: 'an owner mandate', CONSTRUCTION: 'a building job', LEGAL: 'a legal case' } as any)[state.proof.kind]}</b> : null}</p>
      <StarPick value={rating} onChange={setRating} />
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-700">{tx('What stood out? (up to 4)', 'क्या ख़ास रहा? (4 तक)')}</p>
        <div className="flex flex-wrap gap-1.5">
          {TAGS[group].map(t => (
            <button key={t.id} type="button" aria-pressed={tags.includes(t.id)} onClick={() => toggle(t.id)} data-testid={`tag-${t.id}`}
              className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${tags.includes(t.id) ? (t.tone === 'NEG' ? 'border-red-600 bg-red-600 text-white' : 'border-emerald-600 bg-emerald-600 text-white') : 'border-slate-300 bg-white text-slate-700'}`}>{hi ? t.hi : t.en}</button>
          ))}
        </div>
      </div>
      <div>
        <textarea value={remark} onChange={e => setRemark(e.target.value)} maxLength={REMARK_MAX} rows={3} className={inp} data-testid="review-remark"
          placeholder={tx('A line for others (optional). Stick to facts — no links, phone numbers or abuse.', 'दूसरों के लिए एक पंक्ति (वैकल्पिक)। सिर्फ़ तथ्य लिखें — लिंक, फ़ोन नंबर या गाली नहीं।')} />
        <p className="mt-0.5 text-right text-[11px] text-slate-400">{remark.length}/{REMARK_MAX}</p>
      </div>
      <p className="text-[11px] text-slate-500">{tx('Your name, your role and that you worked together will show with the review. You can edit or take it back for 14 days.', 'रिव्यू के साथ आपका नाम, भूमिका और यह दिखेगा कि आपने साथ काम किया। 14 दिन तक आप इसे बदल या वापस ले सकते हैं।')}</p>
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      <div className="flex gap-2"><button type="button" disabled={busy || !rating} className={dark} data-testid="review-send" onClick={send}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('Post review', 'रिव्यू डालें')}</button><button type="button" className={ghost} onClick={onCancel}>{tx('Cancel', 'रद्द')}</button></div>
    </div>
  );
};

// ───────── one profile ─────────
const ProfilePage: React.FC<{ id: string; ticket?: string; onBack: () => void }> = ({ id, ticket, onBack }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [writing, setWriting] = useState(false); const [more, setMore] = useState<any[]>([]); const [sure, setSure] = useState(false);
  const load = useCallback(() => api.profOpen(id, ticket).then(x => { setD(x); setMore([]); }).catch(e => setErr(e.message)), [id, ticket]);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="space-y-3"><button type="button" onClick={onBack} className={ghost}><ArrowLeft className="h-4 w-4" />{tx('Back', 'वापस')}</button><p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{err}</p></div>;
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const c = d.card; const g: TargetGroup = c.group; const r = c.rating;
  const total = Math.max(1, r.count);
  const withdraw = async () => { if (!sure) { setSure(true); return; } setSure(false); try { await api.profReviewDelete(id); load(); } catch (e: any) { setErr(e.message); } };
  return (
    <div className="space-y-4" data-testid="profile-page">
      <button type="button" onClick={onBack} className={ghost}><ArrowLeft className="h-4 w-4" />{tx('Back to search', 'सर्च पर वापस')}</button>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <Avatar card={c} size="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-bold text-slate-900" data-testid="profile-name">{c.name}</h2>
            <p className="text-xs text-slate-500">{hi ? c.groupLabel.hi : c.groupLabel.en}{c.title ? ` · ${c.title}` : ''}{c.firm ? ` · ${c.firm}` : ''}{c.city ? ` · ${c.city}` : ''}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {c.status !== 'ACTIVE' && <Chip tone="red">{tx('Not an active GENZ member', 'GENZ का सक्रिय सदस्य नहीं')}</Chip>}
              {c.checks.idChecked && <Chip tone="green"><ShieldCheck className="mr-0.5 inline h-3 w-3" />{tx('ID checked by GENZ', 'GENZ ने ID जाँची')}</Chip>}
              {c.checks.photo && <Chip tone="green"><Camera className="mr-0.5 inline h-3 w-3" />{tx('Photo checked', 'फ़ोटो जाँची')}</Chip>}
              {c.rera && <Chip tone="blue">RERA {c.rera}</Chip>}
              {c.code && <Chip>{c.code}</Chip>}
              {c.memberSince && <Chip>{tx('On GENZ since', 'GENZ पर')} {c.memberSince}</Chip>}
            </div>
          </div>
        </div>
        {c.status === 'ACTIVE' && (
          <>
            {(c.about || c.areas?.length || c.languages?.length || c.years != null) && (
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                {c.about && <p className="whitespace-pre-wrap break-words">{c.about}</p>}
                <p className="text-xs text-slate-500">
                  {c.years != null ? `${c.years} ${tx('yrs experience', 'साल का अनुभव')}` : ''}{c.areas?.length ? ` ${c.years != null ? '· ' : ''}${c.areas.join(', ')}` : ''}{c.languages?.length ? ` · ${c.languages.join(', ')}` : ''}
                </p>
                {c.dealsClosed > 0 && <p className="text-xs text-slate-500">{tx(`${c.dealsClosed} deal(s) closed on GENZ`, `GENZ पर ${c.dealsClosed} सौदे पूरे`)}{c.confirmedBy ? tx(` · confirmed by ${c.confirmedBy} broker(s)`, ` · ${c.confirmedBy} ब्रोकरों ने पुष्टि की`) : ''}</p>}
              </div>
            )}
            <div className="mt-3 border-t border-slate-100 pt-3">
              {r.count ? (
                <div className="flex items-center gap-4">
                  <div className="text-center"><div className="text-3xl font-extrabold text-slate-900" data-testid="profile-avg">{r.avg.toFixed(1)}</div><Stars value={r.avg} /><div className="text-[11px] text-slate-500">{r.count} {r.count === 1 ? tx('reviewer', 'रिव्यूअर') : tx('reviewers', 'रिव्यूअर')}</div></div>
                  <div className="min-w-0 flex-1 space-y-0.5">{[5, 4, 3, 2, 1].map(s => <div key={s} className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-3">{s}</span><div className="h-1.5 flex-1 rounded bg-slate-100"><div className="h-1.5 rounded bg-amber-400" style={{ width: `${(r.stars[s] / total) * 100}%` }} /></div><span className="w-4 text-right">{r.stars[s]}</span></div>)}</div>
                </div>
              ) : <p className="text-sm text-slate-500">{tx('No reviews yet.', 'अभी कोई रिव्यू नहीं।')}</p>}
              {r.early && r.count > 0 && <p className="mt-1.5 text-[11px] text-amber-700">{tx('Early rating — fewer than 3 people have reviewed.', 'शुरुआती रेटिंग — 3 से कम लोगों ने रिव्यू दिया है।')}</p>}
              {r.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{r.tags.map((t: any) => <Chip key={t.id} tone={TAGS[g].find(x => x.id === t.id)?.tone === 'NEG' ? 'red' : 'green'}>{tagLabel(g, t.id, hi)} · {t.n}</Chip>)}</div>}
            </div>
          </>
        )}
      </div>

      {c.status === 'ACTIVE' && d.review && (
        <div data-testid="review-box">
          {writing ? <ReviewForm targetId={id} group={g} state={d.review} existing={d.mine || null} onDone={() => { setWriting(false); load(); }} onCancel={() => setWriting(false)} />
            : d.review.ok ? <button type="button" className={dark} data-testid="review-open" onClick={() => setWriting(true)}><Star className="h-4 w-4" />{d.mine ? tx('Edit my review', 'मेरा रिव्यू बदलें') : tx('Write a review', 'रिव्यू लिखें')}</button>
              : d.review.reason ? <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600" data-testid="review-why">{hi ? d.review.hi : d.review.reason}</p> : null}
          {d.mine?.editable && !writing && <button type="button" onClick={withdraw} className="ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold text-red-700 underline" data-testid="review-withdraw"><Trash2 className="h-3.5 w-3.5" />{sure ? tx('Tap again to take it back', 'वापस लेने के लिए फिर टैप करें') : tx('Take it back', 'वापस लें')}</button>}
        </div>
      )}

      {c.status === 'ACTIVE' && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">{tx('Reviews', 'रिव्यू')} {d.total ? `(${d.total})` : ''}</h3>
          {d.reviews.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">{tx('Nobody has reviewed this person yet.', 'अभी किसी ने इन्हें रिव्यू नहीं दिया।')}</p>}
          {[...d.reviews, ...more].map((rv: any) => <ReviewCard key={rv.id} rv={rv} group={g} onChanged={load} onEdit={() => setWriting(true)} />)}
          {d.hasMore && more.length === 0 && <button type="button" className={ghost} onClick={() => api.profOpen(id, ticket, d.reviews.length).then(x => setMore(x.reviews))}>{tx('Show more', 'और दिखाएँ')}</button>}
        </div>
      )}
    </div>
  );
};

// ───────── my profile ─────────
const MineTab: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ visible: true, showPhoto: true, about: '', areas: '', languages: '', years: '' });
  const load = useCallback(() => api.profMine().then(x => { setD(x); setF({ visible: x.profile.visible, showPhoto: x.profile.showPhoto, about: x.profile.about, areas: x.profile.areas.join(', '), languages: x.profile.languages.join(', '), years: x.profile.years == null ? '' : String(x.profile.years) }); }).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (err && !d) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{err}</p>;
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const list = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
  const save = async () => {
    setBusy(true); setErr(''); setSaved(false);
    try { await api.profSave({ visible: f.visible, showPhoto: f.showPhoto, about: f.about, areas: list(f.areas), languages: list(f.languages), years: f.years === '' ? null : Number(f.years) }); setSaved(true); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const c = d.card; const g: TargetGroup = c.group;
  return (
    <div className="space-y-4" data-testid="mine-tab">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3"><Avatar card={c} /><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{c.name}</p><RatingLine r={c.rating} /></div></div>
        <p className="mt-2 text-xs text-slate-500">{d.isPrivate
          ? tx('Brokers and builders can check you only by your exact mobile number or GZ code. Names are never listed. This is how GENZ protects the network from fake enquiries — you control the photo and the lines below.', 'ब्रोकर और बिल्डर आपको सिर्फ़ आपके सटीक मोबाइल नंबर या GZ कोड से जाँच सकते हैं। नाम कभी लिस्ट में नहीं दिखते। इसी तरह GENZ नेटवर्क को नकली पूछताछ से बचाती है — फ़ोटो और नीचे की पंक्तियाँ आपके हाथ में हैं।')
          : tx('People find you by searching your name, firm or area. Nothing is listed or browsable. Even if you switch the name search off, your exact mobile number or GZ code — and people who worked with you — still reach this page, so a rating cannot be dodged.', 'लोग आपको नाम, फ़र्म या इलाका खोजकर पाते हैं। कुछ भी लिस्ट या ब्राउज़ नहीं होता। नाम से सर्च बंद करने पर भी आपका सटीक मोबाइल नंबर या GZ कोड — और जिन्होंने आपके साथ काम किया — इस पेज तक पहुँचते हैं, ताकि रेटिंग से बचा न जा सके।')}</p>
        <div className="mt-3 space-y-3">
          {!d.isPrivate && (
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={f.visible} onChange={e => setF({ ...f, visible: e.target.checked })} className="h-5 w-5" data-testid="prof-visible" />{tx('Show me when people search by name', 'नाम से सर्च करने पर मुझे दिखाएँ')}</label>
          )}
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={f.showPhoto} onChange={e => setF({ ...f, showPhoto: e.target.checked })} className="h-5 w-5" data-testid="prof-photo" />{tx('Show my checked photo (if I have one)', 'मेरी जाँची हुई फ़ोटो दिखाएँ (अगर है)')}</label>
          <textarea value={f.about} onChange={e => setF({ ...f, about: e.target.value })} maxLength={ABOUT_MAX} rows={3} className={inp} data-testid="prof-about" placeholder={tx('A line about you — what you do, what you are good at (no links or phone numbers)', 'अपने बारे में एक पंक्ति — आप क्या करते हैं (लिंक या फ़ोन नंबर नहीं)')} />
          <input value={f.areas} onChange={e => setF({ ...f, areas: e.target.value })} className={inp} data-testid="prof-areas" placeholder={tx('Areas you work in, separated by commas', 'आप किन इलाकों में काम करते हैं (कॉमा से अलग)')} />
          <div className="grid grid-cols-2 gap-2">
            <input value={f.languages} onChange={e => setF({ ...f, languages: e.target.value })} className={inp} placeholder={tx('Languages', 'भाषाएँ')} />
            <input value={f.years} onChange={e => setF({ ...f, years: e.target.value.replace(/\D/g, '').slice(0, 2) })} inputMode="numeric" className={inp} placeholder={tx('Years of work', 'काम के साल')} />
          </div>
          {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
          {saved && <p className="text-xs text-emerald-700">{tx('Saved.', 'सेव हो गया।')}</p>}
          <button type="button" disabled={busy} onClick={save} className={dark} data-testid="prof-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('Save my profile', 'मेरी प्रोफ़ाइल सेव करें')}</button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">{tx('What people said about you', 'लोगों ने आपके बारे में क्या कहा')} ({d.reviewsAboutMe.length})</h3>
        {d.reviewsAboutMe.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">{tx('No reviews yet. They come after you work with someone on GENZ.', 'अभी कोई रिव्यू नहीं। GENZ पर किसी के साथ काम करने के बाद आते हैं।')}</p>}
        {d.reviewsAboutMe.map((rv: any) => <ReviewCard key={rv.id} rv={rv} group={g} onChanged={load} canReply />)}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">{tx('Reviews you wrote', 'आपके लिखे रिव्यू')} ({d.reviewsIWrote.length})</h3>
        {d.reviewsIWrote.map((rv: any) => (
          <div key={rv.id} className="space-y-1">
            <ReviewCard rv={rv} group={rv.target.group} target={rv.target} onChanged={load} />
            <button type="button" className="min-h-11 px-2 text-xs font-semibold text-slate-700 underline" onClick={() => onOpen(rv.target.id)}>{tx('Open his profile to edit', 'बदलने के लिए उनकी प्रोफ़ाइल खोलें')}</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ───────── GENZ staff ─────────
const AdminTab: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [why, setWhy] = useState<Record<string, string>>({});
  const load = useCallback(() => api.profQueue().then(setD).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); load(); } catch (e: any) { setErr(e.message); } };
  if (!d) return err ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p> : <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const row = (x: any, hidden: boolean) => (
    <div key={x.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid="admin-review">
      <ReviewCard rv={{ ...x, mine: false, reported: true }} group={x.target.group} target={x.target} onChanged={load} />
      {x.reportsDetail?.length > 0 && <ul className="space-y-0.5 text-[11px] text-slate-600">{x.reportsDetail.map((p: any, i: number) => <li key={i}>• {p.by}{p.byTarget ? ` (${tx('the reviewed person', 'जिसका रिव्यू है')})` : ''}: {hi ? (REPORT_REASONS.find(r => r.id === p.reason)?.hi || p.reason) : (REPORT_REASONS.find(r => r.id === p.reason)?.en || p.reason)}{p.note ? ` — ${p.note}` : ''}</li>)}</ul>}
      {hidden
        ? <button type="button" className={ghost} onClick={() => act(() => api.profRestore(x.id))} data-testid="admin-restore">{tx('Restore this review', 'यह रिव्यू वापस लाएँ')}</button>
        : (
          <div className="space-y-2">
            <input value={why[x.id] || ''} onChange={e => setWhy({ ...why, [x.id]: e.target.value })} maxLength={200} className={inp} data-testid="admin-reason" placeholder={tx('Reason (shown to both people) — to hide', 'कारण (दोनों को दिखेगा) — हटाने के लिए')} />
            <div className="flex gap-2">
              <button type="button" className={dark} disabled={(why[x.id] || '').trim().length < 5} onClick={() => act(() => api.profHide(x.id, (why[x.id] || '').trim()))} data-testid="admin-hide">{tx('Hide review', 'रिव्यू हटाएँ')}</button>
              <button type="button" className={ghost} onClick={() => act(() => api.profClear(x.id))} data-testid="admin-keep">{tx('Keep it', 'रहने दें')}</button>
            </div>
          </div>
        )}
    </div>
  );
  return (
    <div className="space-y-4" data-testid="admin-tab">
      {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{err}</p>}
      <h3 className="text-sm font-bold text-slate-900">{tx('Reported reviews', 'रिपोर्ट हुए रिव्यू')} ({d.reported.length})</h3>
      {d.reported.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">{tx('Nothing reported.', 'कुछ रिपोर्ट नहीं हुआ।')}</p>}
      {d.reported.map((x: any) => row(x, false))}
      <h3 className="pt-2 text-sm font-bold text-slate-900">{tx('Hidden by GENZ', 'GENZ ने हटाए')} ({d.hidden.length})</h3>
      {d.hidden.map((x: any) => row(x, true))}
    </div>
  );
};

type Sub = 'find' | 'mine' | 'admin';
export const ProfilesView: React.FC<{ role: string; permissions: string[]; startOn?: 'find' | 'mine' }> = ({ role, permissions, startOn }) => {
  const tx = useTx();
  const [sub, setSub] = useState<Sub>(startOn === 'mine' && role !== 'ADMIN' && role !== 'SUPERADMIN' ? 'mine' : 'find');
  const [open, setOpen] = useState<{ id: string; ticket?: string } | null>(null);
  const admin = permissions.includes('review:moderate');
  const staff = role === 'ADMIN' || role === 'SUPERADMIN';   // staff have no profile of their own
  const tabs: [Sub, string, string][] = [['find', 'Find', 'ढूँढें'], ...(staff ? [] : [['mine', 'My profile', 'मेरी प्रोफ़ाइल'] as [Sub, string, string]]), ...(admin ? [['admin', 'Reports', 'रिपोर्ट'] as [Sub, string, string]] : [])];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{tx('Profiles & Reviews', 'प्रोफ़ाइल और रिव्यू')}</h2>
        <p className="text-xs text-slate-500">{tx('Check who you are dealing with, and be known for honest work. Reviews come only from people who really worked with you on GENZ.', 'जिससे काम कर रहे हैं उसे जाँचें, और ईमानदार काम से पहचान बनाएँ। रिव्यू सिर्फ़ वही देते हैं जिन्होंने GENZ पर सच में आपके साथ काम किया।')}</p>
      </div>
      {!open && (
        <div className="flex gap-1.5" role="tablist">
          {tabs.map(([k, en, hi]) => <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} data-testid={`people-tab-${k}`} className={`inline-flex min-h-11 items-center rounded-full px-4 text-xs font-semibold ${sub === k ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{tx(en, hi)}</button>)}
        </div>
      )}
      {open ? <ProfilePage id={open.id} ticket={open.ticket} onBack={() => setOpen(null)} />
        : sub === 'find' ? <FindTab role={role} onOpen={(id, ticket) => setOpen({ id, ticket })} />
          : sub === 'mine' ? <MineTab onOpen={id => setOpen({ id })} />
            : <AdminTab />}
    </div>
  );
};
