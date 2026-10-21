import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Rocket, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { Err, useBusy, inp, btnDark, btnLine } from './CrmPlus.js';
import { Chip, Tog } from './InventorySheets.js';
import { SEGMENTS, SEGMENT_LABEL, type Segment } from '../shared/launchRules.js';
import { formatINR } from '../lib/utils.js';

/**
 * v16.8 — GENZ launches a builder's project to the network, in waves.
 *  GENZ Launch Desk  (admin)   segments, request → plan → live / pause / close
 *  BuilderLaunchPanel (builder) the builder's yes / no — nothing goes live without it
 * GENZ takes no commission, and the builder still approves every partner.
 */

const localIso = (iso?: string) => { const d = iso ? new Date(iso) : new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toIso = (local: string) => new Date(local).toISOString();
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** The history lines are written by the server in English; show them in Hindi when the screen is Hindi. */
const HIST: [RegExp, string][] = [
  [/^Asked the builder to let GENZ launch this project to the network/, 'GENZ ने बिल्डर से इस प्रोजेक्ट को नेटवर्क पर लॉन्च करने की अनुमति माँगी'],
  [/^Builder agreed to the GENZ launch/, 'बिल्डर ने GENZ लॉन्च के लिए हाँ कही'],
  [/^Builder invited GENZ to launch this project/, 'बिल्डर ने GENZ को इस प्रोजेक्ट को लॉन्च करने के लिए बुलाया'],
  [/^Builder declined the GENZ launch/, 'बिल्डर ने GENZ लॉन्च से मना किया'],
  [/^Builder withdrew the permission — launch closed/, 'बिल्डर ने अनुमति वापस ली — लॉन्च बंद'],
  [/^Launch plan edited \(while live\)/, 'लॉन्च प्लान बदला (लाइव रहते)'],
  [/^Launch plan edited/, 'लॉन्च प्लान बदला'],
  [/^Launch live/, 'लॉन्च लाइव हुआ'], [/^Launch paused/, 'लॉन्च रोका गया'], [/^Launch closed/, 'लॉन्च बंद हुआ'], [/^Launch draft/, 'लॉन्च ड्राफ़्ट में लौटा'],
];
const histText = (what: string, hi: boolean) => { if (!hi) return what; const h = HIST.find(([re]) => re.test(what)); return h ? what.replace(h[0], h[1]) : what; };

const CONSENT: Record<string, [string, string, string]> = {
  NONE: ['Not asked yet', 'अभी पूछा नहीं', 'bg-slate-100 text-slate-700'],
  REQUESTED: ['Waiting for builder', 'बिल्डर के जवाब का इंतज़ार', 'bg-amber-100 text-amber-800'],
  GRANTED: ['Builder agreed', 'बिल्डर राज़ी', 'bg-emerald-100 text-emerald-800'],
  DECLINED: ['Builder said no', 'बिल्डर ने मना किया', 'bg-red-100 text-red-700'],
};
const STATUS: Record<string, [string, string, string]> = {
  DRAFT: ['Draft', 'ड्राफ़्ट', 'bg-slate-100 text-slate-700'],
  LIVE: ['Live', 'लाइव', 'bg-emerald-100 text-emerald-800'],
  PAUSED: ['Paused', 'रुका हुआ', 'bg-amber-100 text-amber-800'],
  CLOSED: ['Closed', 'बंद', 'bg-slate-200 text-slate-700'],
};
const Pill: React.FC<{ map: Record<string, [string, string, string]>; k: string }> = ({ map, k }) => { const tx = useTx(); const m = map[k] || map.NONE || map.DRAFT; return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m[2]}`}>{tx(m[0], m[1])}</span>; };

// ───────────────────────── GENZ desk ─────────────────────────
export const LaunchDesk: React.FC = () => {
  const tx = useTx();
  const [projects, setProjects] = useState<any[] | null>(null);
  const [seg, setSeg] = useState<{ counts: Record<string, number>; members: any[] } | null>(null);
  const [openSeg, setOpenSeg] = useState<Segment | null>(null);
  const [openProj, setOpenProj] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4500); };
  const load = useCallback(async () => {
    try { const [p, s] = await Promise.all([api.launchAdminProjects(), api.launchAdminSegments()]); setProjects(p.projects); setSeg(s); } catch (e: any) { flash(false, e.message); setProjects(x => x ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!projects || !seg) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Rocket className="h-5 w-5" />{tx('Launch Desk', 'लॉन्च डेस्क')}</h2>
        <p className="text-xs text-slate-500">{tx('Launch a builder’s project to the network in waves: big RERA firms first, then independent brokers, and a preview for local associates. Nothing goes live without the builder’s yes. GENZ takes no commission, and the builder approves every partner.', 'बिल्डर का प्रोजेक्ट नेटवर्क पर लहर-दर-लहर लॉन्च करें: पहले बड़ी RERA फ़र्में, फिर स्वतंत्र ब्रोकर, और लोकल एसोसिएट को सिर्फ़ झलक। बिल्डर की हाँ के बिना कुछ लाइव नहीं होता। GENZ कोई कमीशन नहीं लेता और हर पार्टनर को बिल्डर ही मंज़ूर करता है।')}</p>
      </div>
      {msg && <div role="status" className={`rounded-lg px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{tx('Who is in which group', 'कौन किस ग्रुप में')}</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {SEGMENTS.map(k => (
            <button key={k} type="button" aria-expanded={openSeg === k} onClick={() => setOpenSeg(openSeg === k ? null : k)} className={`rounded-xl border bg-white p-3 text-left hover:border-slate-900 ${openSeg === k ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between"><span className="text-2xl font-bold text-slate-900">{seg.counts[k] ?? 0}</span>{openSeg === k ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}</div>
              <div className="text-xs font-semibold text-slate-800">{tx(SEGMENT_LABEL[k].en, SEGMENT_LABEL[k].hi)}</div>
              <div className="text-[10px] text-slate-500">{tx(SEGMENT_LABEL[k].hint.en, SEGMENT_LABEL[k].hint.hi)}</div>
            </button>
          ))}
        </div>
        {openSeg && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            {seg.members.filter(m => m.segment === openSeg).length === 0 && <p className="text-xs text-slate-400">{tx('Nobody here yet.', 'यहाँ अभी कोई नहीं।')}</p>}
            <ul className="divide-y divide-slate-100">
              {seg.members.filter(m => m.segment === openSeg).map(m => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0"><div className="font-semibold">{m.name}{m.company ? <span className="font-normal text-slate-500"> · {m.company}</span> : null}</div>
                    <div className="text-[10px] text-slate-500">{m.city || '—'} · {m.staff} {tx('active staff', 'सक्रिय स्टाफ़')}{m.override ? ` · ${tx('set by desk', 'डेस्क ने तय किया')}` : ''}</div></div>
                  {m.tier !== 'TIER2' ? (
                    <div className="flex gap-1.5">
                      {([['BIG_FIRM', 'Big firm', 'बड़ी फ़र्म'], ['INDEPENDENT', 'Independent', 'स्वतंत्र']] as const).map(([k, en, hi]) => <Chip key={k} on={m.override === k} onClick={async () => { try { await api.launchSetSegment(m.id, k); await load(); } catch (e: any) { flash(false, e.message); } }}>{tx(en, hi)}</Chip>)}
                      <Chip on={!m.override} onClick={async () => { try { await api.launchSetSegment(m.id, null); await load(); } catch (e: any) { flash(false, e.message); } }}>{tx('Auto', 'ऑटो')}</Chip>
                    </div>
                  ) : <span className="text-[10px] text-slate-400">{tx('No RERA no. — always preview only', 'RERA नंबर नहीं — हमेशा सिर्फ़ झलक')}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-slate-500">{tx('Names and city only — no phone or e-mail. Auto = big firm when RERA no. is on file and 5+ active staff.', 'सिर्फ़ नाम और शहर — फ़ोन/ईमेल नहीं। ऑटो = RERA नंबर दर्ज और 5+ सक्रिय स्टाफ़ हो तो बड़ी फ़र्म।')}</p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{tx('Projects', 'प्रोजेक्ट')} ({projects.length})</h3>
        {projects.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">{tx('No builder project yet.', 'अभी कोई बिल्डर प्रोजेक्ट नहीं।')}</p>}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {projects.map(p => (
            <div key={p.id} className={`rounded-xl border bg-white ${openProj === p.id ? 'border-slate-900 md:col-span-2' : 'border-slate-200'}`}>
              <button type="button" aria-expanded={openProj === p.id} onClick={() => setOpenProj(openProj === p.id ? null : p.id)} className="block min-h-14 w-full p-3 text-left">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{p.projectName}</div><div className="text-[11px] text-slate-500">{p.builderName} · {[p.locality, p.city].filter(Boolean).join(', ')}</div></div>
                  <div className="flex shrink-0 flex-col items-end gap-1"><Pill map={CONSENT} k={p.plan?.consent || 'NONE'} />{p.plan?.consent === 'GRANTED' && <Pill map={STATUS} k={p.plan.status} />}</div></div>
                <div className="mt-1 text-[11px] text-slate-500">{formatINR(p.priceStartingFrom)}–{formatINR(p.priceMax)} · {p.partners} {tx('partners', 'पार्टनर')}{!p.hasRera ? ` · ${tx('no RERA no.', 'RERA नंबर नहीं')}` : ''}</div>
              </button>
              {openProj === p.id && <div className="border-t border-slate-100 p-3"><ProjectPlan p={p} counts={seg.counts} reload={load} flash={flash} /></div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const ProjectPlan: React.FC<{ p: any; counts: Record<string, number>; reload: () => Promise<void>; flash: (ok: boolean, t: string) => void }> = ({ p, counts, reload, flash }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const plan = p.plan;
  const granted = plan?.consent === 'GRANTED';
  const [note, setNote] = useState('');
  const [headline, setHeadline] = useState(plan?.headline || '');
  const [pnote, setPnote] = useState(plan?.note || '');
  const [w, setW] = useState({
    big: { on: plan?.waves?.BIG_FIRM?.on ?? true, at: localIso(plan?.waves?.BIG_FIRM?.at) },
    ind: { on: plan?.waves?.INDEPENDENT?.on ?? true, at: localIso(plan?.waves?.INDEPENDENT?.at) },
    loc: { mode: (plan?.waves?.LOCAL?.mode ?? 'OFF') as 'OFF' | 'TEASER', at: localIso(plan?.waves?.LOCAL?.at) },
  });
  const { busy, err, go, setErr } = useBusy();
  const done = (m: string) => () => { flash(true, m); reload(); };
  const preset = (kind: 'ALL' | 'STAGED') => {
    const now = localIso(); const d3 = localIso(new Date(Date.now() + 3 * 86400_000).toISOString());
    setW(kind === 'ALL' ? { big: { on: true, at: now }, ind: { on: true, at: now }, loc: { mode: 'OFF', at: now } }
      : { big: { on: true, at: now }, ind: { on: true, at: d3 }, loc: { mode: 'TEASER', at: d3 } });
  };
  const savePlan = () => go(() => api.launchPlan(p.id, { headline, note: pnote, waves: { BIG_FIRM: { on: w.big.on, at: toIso(w.big.at) }, INDEPENDENT: { on: w.ind.on, at: toIso(w.ind.at) }, LOCAL: { mode: w.loc.mode, at: toIso(w.loc.at) } } }), done(tx('Plan saved', 'प्लान सेव हुआ')));
  const setStatus = (s: string, m: string) => go(() => api.launchStatus(p.id, s), done(m));

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
        <span className="rounded bg-slate-100 px-2 py-0.5">{tx('Project status', 'प्रोजेक्ट स्टेटस')}: <b>{p.status}</b></span>
        <span className="rounded bg-slate-100 px-2 py-0.5">{p.access === 'INVITE_ONLY' ? tx('Invite-only', 'सिर्फ़ इनवाइट') : tx('Open to apply', 'अप्लाई के लिए खुला')}</span>
        {p.commissionPct ? <span className="rounded bg-slate-100 px-2 py-0.5">{tx('Builder’s commission', 'बिल्डर का कमीशन')}: {p.commissionPct}%</span> : null}
      </div>

      {(!plan || plan.consent === 'NONE' || plan.consent === 'DECLINED') && (
        <div className="space-y-2">
          {plan?.consent === 'DECLINED' && <p className="rounded-lg bg-red-50 p-2 text-red-700">{tx('The builder declined earlier. You can ask again with a clearer note.', 'बिल्डर ने पहले मना किया था। साफ़ नोट के साथ दोबारा पूछ सकते हैं।')}</p>}
          <input value={note} onChange={e => setNote(e.target.value.slice(0, 300))} placeholder={tx('Note to the builder (why launch, which partners)', 'बिल्डर के लिए नोट (क्यों लॉन्च, कौन से पार्टनर)')} className={inp} />
          <Err msg={err} />
          <button type="button" disabled={busy} onClick={() => go(() => api.launchRequest(p.id, note), done(tx('Request sent to the builder', 'बिल्डर को रिक्वेस्ट भेज दी')))} className={btnDark}>{tx('Ask the builder for permission', 'बिल्डर से अनुमति माँगें')}</button>
        </div>
      )}
      {plan?.consent === 'REQUESTED' && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">{tx(`Waiting for the builder (asked ${when(plan.requestedAt)}). Nothing can be planned until he agrees.`, `बिल्डर के जवाब का इंतज़ार (${when(plan.requestedAt)} को पूछा)। उसकी हाँ तक प्लान नहीं बन सकता।`)}</p>}

      {granted && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => preset('ALL')} className={btnLine}>{tx('All groups now', 'सब ग्रुप अभी')}</button>
            <button type="button" onClick={() => preset('STAGED')} className={btnLine}>{tx('Big firms now, others in 3 days', 'बड़ी फ़र्में अभी, बाकी 3 दिन बाद')}</button>
          </div>
          {([['big', 'BIG_FIRM'], ['ind', 'INDEPENDENT']] as const).map(([k, seg]) => (
            <div key={k} className="rounded-lg border border-slate-200 p-2">
              <Tog on={w[k].on} onChange={v => setW({ ...w, [k]: { ...w[k], on: v } })} label={`${tx(SEGMENT_LABEL[seg].en, SEGMENT_LABEL[seg].hi)} (${counts[seg] ?? 0})`} hint={tx('May see the project, its units and terms, and apply from this time.', 'इस समय से प्रोजेक्ट, यूनिट और शर्तें देख और अप्लाई कर सकते हैं।')} />
              {w[k].on && <input type="datetime-local" value={w[k].at} onChange={e => setW({ ...w, [k]: { ...w[k], at: e.target.value } })} className={inp} aria-label={tx('Opens at', 'खुलने का समय')} />}
            </div>
          ))}
          <div className="rounded-lg border border-slate-200 p-2">
            <div className="mb-1 font-semibold text-slate-800">{tx(SEGMENT_LABEL.LOCAL.en, SEGMENT_LABEL.LOCAL.hi)} ({counts.LOCAL ?? 0})</div>
            <div className="mb-1 flex gap-1.5">{([['OFF', 'Hidden', 'छुपा'], ['TEASER', 'Preview only', 'सिर्फ़ झलक']] as const).map(([k, en, hi]) => <Chip key={k} on={w.loc.mode === k} onClick={() => setW({ ...w, loc: { ...w.loc, mode: k } })}>{tx(en, hi)}</Chip>)}</div>
            {w.loc.mode === 'TEASER' && <input type="datetime-local" value={w.loc.at} onChange={e => setW({ ...w, loc: { ...w.loc, at: e.target.value } })} className={inp} aria-label={tx('Preview from', 'झलक कब से')} />}
            <p className="mt-1 text-[10px] text-slate-500">{tx('Local associates (no RERA no.) never get a selling window: name, place and date only — no rates, units, commission or apply button.', 'लोकल एसोसिएट (RERA नंबर नहीं) को बिक्री की खिड़की कभी नहीं मिलती: सिर्फ़ नाम, जगह और तारीख़ — रेट, यूनिट, कमीशन या अप्लाई बटन नहीं।')}</p>
          </div>
          <input value={headline} onChange={e => setHeadline(e.target.value.slice(0, 120))} placeholder={tx('Headline partners see (e.g. “Phase 2 plots — launch offer”)', 'पार्टनर को दिखने वाली हेडलाइन (जैसे “फ़ेज़ 2 प्लॉट — लॉन्च ऑफ़र”)')} className={inp} />
          <textarea value={pnote} onChange={e => setPnote(e.target.value.slice(0, 400))} rows={2} placeholder={tx('Note for partners (optional)', 'पार्टनर के लिए नोट (वैकल्पिक)')} className={inp} />
          <Err msg={err} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => { setErr(''); savePlan(); }} className={btnDark}>{tx('Save plan', 'प्लान सेव करें')}</button>
            {plan.status !== 'LIVE' && <button type="button" disabled={busy} onClick={() => setStatus('LIVE', tx('Launch is live', 'लॉन्च लाइव हो गया'))} className={`${btnDark} bg-emerald-700`}><Rocket className="h-4 w-4" />{plan.status === 'PAUSED' ? tx('Resume', 'फिर चालू करें') : tx('Go live', 'लाइव करें')}</button>}
            {plan.status === 'LIVE' && <button type="button" disabled={busy} onClick={() => setStatus('PAUSED', tx('Launch paused', 'लॉन्च रोका गया'))} className={btnLine}>{tx('Pause', 'रोकें')}</button>}
            {plan.status !== 'CLOSED' && <button type="button" disabled={busy} onClick={() => setStatus('CLOSED', tx('Launch closed', 'लॉन्च बंद हुआ'))} className={btnLine}>{tx('Close launch', 'लॉन्च बंद करें')}</button>}
          </div>
          <p className="text-[10px] text-slate-500">{tx('Pausing or closing hides the project from partners who have no mandate; existing partners are not affected. Saving the plan while live changes the waves at once.', 'रोकने या बंद करने पर जिन पार्टनर के पास मैंडेट नहीं उनसे प्रोजेक्ट छुप जाता है; मौजूदा पार्टनर पर असर नहीं। लाइव रहते प्लान सेव करने पर लहरें तुरंत बदल जाती हैं।')}</p>
        </div>
      )}

      {plan?.history?.length > 0 && (
        <details className="rounded-lg bg-slate-50 p-2"><summary className="cursor-pointer font-semibold text-slate-700">{tx('History', 'इतिहास')}</summary>
          <ul className="mt-1 space-y-0.5 text-[10px] text-slate-600">{plan.history.slice(0, 8).map((h: any, i: number) => <li key={i}>{when(h.at)} · {h.by} · {histText(h.what, hi)}</li>)}</ul></details>
      )}
    </div>
  );
};

// ───────────────────────── builder ─────────────────────────
export const BuilderLaunchPanel: React.FC = () => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { busy, err, go, setErr } = useBusy();
  const load = useCallback(() => api.launchBuilderProjects().then(r => setRows(r.projects)).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  if (!rows || rows.length === 0) return null;
  const waiting = rows.filter(r => r.plan?.consent === 'REQUESTED').length;
  const decide = (id: string, d: 'GRANT' | 'DECLINE' | 'WITHDRAW', ok: string) => go(() => api.launchConsent(id, d, note), () => { setMsg({ ok: true, text: ok }); setNote(''); load(); });

  return (
    <section className={`rounded-xl border bg-white ${waiting ? 'border-amber-400' : 'border-slate-200'}`}>
      <button type="button" aria-expanded={panel} onClick={() => setPanel(!panel)} className="flex min-h-14 w-full items-center justify-between gap-2 p-3 text-left">
        <span><b className="flex items-center gap-1.5 text-sm text-slate-900"><Rocket className="h-4 w-4" />{tx('GENZ network launch', 'GENZ नेटवर्क लॉन्च')}{waiting > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{waiting}</span>}</b>
          <span className="text-[11px] text-slate-500">{waiting > 0 ? tx('GENZ is waiting for your yes / no', 'GENZ आपकी हाँ / ना का इंतज़ार कर रहा है') : tx('Let GENZ introduce your project to big RERA firms and independent brokers — only with your permission.', 'GENZ आपके प्रोजेक्ट को बड़ी RERA फ़र्मों और स्वतंत्र ब्रोकरों तक पहुँचाए — सिर्फ़ आपकी अनुमति से।')}</span></span>
        {panel ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
      </button>
      {panel && (
        <div className="space-y-2 border-t border-slate-100 p-3 text-xs">
          <p className="text-slate-600">{tx('Free for you and for partners — GENZ takes no commission. Nothing goes live without your yes, you can withdraw any time, and you still approve every partner who applies. Local associates (no RERA no.) only see a preview, never rates or units.', 'आपके और पार्टनर दोनों के लिए मुफ़्त — GENZ कोई कमीशन नहीं लेता। आपकी हाँ के बिना कुछ लाइव नहीं होता, आप कभी भी वापस ले सकते हैं, और अप्लाई करने वाले हर पार्टनर को आप ही मंज़ूर करते हैं। लोकल एसोसिएट (RERA नंबर नहीं) को सिर्फ़ झलक दिखती है, रेट या यूनिट कभी नहीं।')}</p>
          {msg && <div role="status" className="rounded-lg bg-emerald-50 px-3 py-2 font-medium text-emerald-800">{msg.text}</div>}
          {rows.map(r => {
            const pl = r.plan; const c = pl?.consent || 'NONE'; const isOpen = open === r.id;
            return (
              <div key={r.id} className="rounded-lg border border-slate-200">
                <button type="button" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : r.id); setNote(''); setErr(''); }} className="flex min-h-12 w-full items-center justify-between gap-2 p-2.5 text-left">
                  <span className="min-w-0 truncate font-semibold text-slate-900">{r.projectName}</span>
                  <span className="flex shrink-0 gap-1"><Pill map={CONSENT} k={c} />{c === 'GRANTED' && <Pill map={STATUS} k={pl.status} />}</span>
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-slate-100 p-2.5">
                    {c === 'REQUESTED' && <p className="rounded bg-amber-50 p-2 text-amber-900">{tx(`GENZ (${pl.requestedBy || 'desk'}) asked on ${when(pl.requestedAt)}`, `GENZ (${pl.requestedBy || 'डेस्क'}) ने ${when(pl.requestedAt)} को पूछा`)}{pl.requestNote ? ` — “${pl.requestNote}”` : ''}</p>}
                    {c === 'GRANTED' && (
                      <div className="space-y-1 text-slate-700">
                        <div>{pl.status === 'LIVE' ? tx('GENZ has launched it to the network.', 'GENZ ने इसे नेटवर्क पर लॉन्च कर दिया है।') : pl.status === 'DRAFT' ? tx('You agreed. GENZ is still planning — nothing is visible yet.', 'आप राज़ी हैं। GENZ अभी प्लान बना रहा है — अभी कुछ दिख नहीं रहा।') : pl.status === 'PAUSED' ? tx('Paused by GENZ.', 'GENZ ने रोका है।') : tx('Closed.', 'बंद।')}</div>
                        {pl.headline && <div className="font-semibold">{pl.headline}</div>}
                        <div className="text-[11px] text-slate-500">{tx('Big firms', 'बड़ी फ़र्में')}: {pl.waves?.BIG_FIRM?.on ? when(pl.waves.BIG_FIRM.at) : tx('off', 'बंद')} · {tx('Independents', 'स्वतंत्र')}: {pl.waves?.INDEPENDENT?.on ? when(pl.waves.INDEPENDENT.at) : tx('off', 'बंद')} · {tx('Locals', 'लोकल')}: {pl.waves?.LOCAL?.mode === 'TEASER' ? tx('preview', 'झलक') : tx('hidden', 'छुपा')}</div>
                        {r.access === 'INVITE_ONLY' && <div className="rounded bg-slate-100 p-1.5 text-[11px]">{tx('This project is invite-only, so GENZ cannot take it live. Open it to applications in Rules first.', 'यह प्रोजेक्ट सिर्फ़ इनवाइट है, इसलिए GENZ इसे लाइव नहीं कर सकता। पहले Rules में अप्लाई के लिए खोलें।')}</div>}
                      </div>
                    )}
                    {(c === 'NONE' || c === 'DECLINED') && <p className="text-slate-600">{c === 'DECLINED' ? tx('You declined earlier. You can still invite GENZ now.', 'आपने पहले मना किया था। अब भी GENZ को बुला सकते हैं।') : tx('You can invite GENZ to launch this project to the network.', 'आप GENZ को इस प्रोजेक्ट को नेटवर्क पर लॉन्च करने के लिए बुला सकते हैं।')}</p>}
                    <input value={note} onChange={e => setNote(e.target.value.slice(0, 200))} placeholder={tx('Note (optional)', 'नोट (वैकल्पिक)')} className={inp} />
                    <Err msg={err} />
                    <div className="flex flex-wrap gap-2">
                      {(c === 'REQUESTED' || c === 'NONE' || c === 'DECLINED') && <button type="button" disabled={busy} onClick={() => decide(r.id, 'GRANT', tx('You agreed — GENZ can now plan the launch', 'आपने हाँ कही — GENZ अब लॉन्च प्लान कर सकता है'))} className={btnDark}>{c === 'REQUESTED' ? tx('Agree', 'हाँ, मंज़ूर') : tx('Invite GENZ to launch', 'GENZ को लॉन्च के लिए बुलाएँ')}</button>}
                      {c === 'REQUESTED' && <button type="button" disabled={busy} onClick={() => decide(r.id, 'DECLINE', tx('Declined', 'मना कर दिया'))} className={btnLine}>{tx('Decline', 'मना करें')}</button>}
                      {c === 'GRANTED' && <button type="button" disabled={busy} onClick={() => decide(r.id, 'WITHDRAW', tx('Permission withdrawn — launch closed', 'अनुमति वापस — लॉन्च बंद'))} className={btnLine}>{tx('Withdraw permission', 'अनुमति वापस लें')}</button>}
                    </div>
                    {pl?.history?.length > 0 && <ul className="space-y-0.5 text-[10px] text-slate-500">{pl.history.slice(0, 4).map((h: any, i: number) => <li key={i}>{when(h.at)} · {h.by} · {histText(h.what, hi)}</li>)}</ul>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

