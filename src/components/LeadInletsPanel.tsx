import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, ChevronDown, Code2, Copy, FlaskConical, Globe, Link2, Loader2, Megaphone, Pause, Play, Plug, Plus, RotateCw, ShieldCheck, Trash2, Webhook, XCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { useUI } from '../lib/ui.js';
import { Sheet, Err, useBusy, inp, btnDark, btnLine } from './CrmPlus.js';
import { copyText, siteUrl } from './InventorySheets.js';

/**
 * v107 — lead addresses. A broker or a builder makes a secret address for ONE project; enquiries sent to it become ordinary leads in his CRM
 * (same duplicate protection, intake switch, mandate and auto-allotment as a lead he types). Two kinds:
 *   a hosted enquiry form (a link for WhatsApp / ads / a QR, or a form to paste on his own site) — and
 *   a webhook that Zapier / Make / any tool can post to, so a portal's enquiry e-mail or a Facebook / Instagram lead ad can reach the CRM.
 * GENZ has no direct connection to 99acres, MagicBricks, Housing.com or Meta — the screen says so in plain words.
 */

const ICON: Record<string, React.ReactNode> = {
  WEBSITE: <Globe className="h-4 w-4" />, PORTAL: <Building2 className="h-4 w-4" />, META: <Megaphone className="h-4 w-4" />, OTHER: <Plug className="h-4 w-4" />,
};
const OUT_STYLE: Record<string, string> = {
  CREATED: 'bg-emerald-100 text-emerald-800', DUPLICATE: 'bg-sky-100 text-sky-800', REJECTED: 'bg-amber-100 text-amber-900', LIMIT: 'bg-red-100 text-red-700',
};

const ago = (iso: string | undefined, hi: boolean) => {
  if (!iso) return hi ? 'अभी तक नहीं' : 'not yet';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return hi ? 'अभी' : 'just now';
  if (m < 60) return hi ? `${m} मिनट पहले` : `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return hi ? `${h} घंटे पहले` : `${h} h ago`;
  const d = Math.round(h / 24); return hi ? `${d} दिन पहले` : `${d} d ago`;
};

const Mini: React.FC<{ n: number; label: string; tone?: string }> = ({ n, label, tone }) => (
  <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-center"><div className={`text-base font-extrabold tabular-nums ${tone || 'text-slate-900'}`}>{n}</div><div className="text-[10px] leading-tight text-slate-500">{label}</div></div>
);

/** the plain-words steps for connecting a bridge channel */
const Guide: React.FC<{ inlet: any; url: string }> = ({ inlet, url }) => {
  const tx = useTx();
  const [flash, setFlash] = useState(''); const [html, setHtml] = useState('');
  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 1800); };
  const copy = async (text: string) => say((await copyText(text)) ? tx('Copied', 'कॉपी हो गया') : tx('Copy failed', 'कॉपी नहीं हुआ'));
  const curl = `curl -X POST '${url}' -H 'Content-Type: application/json' -d '{"name":"Test Customer","phone":"9876543210","message":"Interested in a plot"}'`;
  const steps: Record<string, [string, string][]> = {
    PORTAL: [
      ['In Zapier or Make, start a new automation. Trigger: the portal’s enquiry e-mail arrives (Gmail / Outlook “new e-mail”, then an e-mail parser to pick out the name and mobile).', 'Zapier या Make में नया ऑटोमेशन बनाएँ। ट्रिगर: पोर्टल की पूछताछ वाला ई-मेल आना (Gmail / Outlook “new e-mail”, फिर ई-मेल पार्सर से नाम और मोबाइल निकालें)।'],
      ['Action: Webhooks → POST, payload type JSON, to the address below.', 'एक्शन: Webhooks → POST, पेलोड JSON, नीचे वाले पते पर।'],
      ['Map the fields: name, phone, email, message. Any other field you send is kept in the lead’s note.', 'फ़ील्ड जोड़ें: name, phone, email, message। जो और फ़ील्ड भेजेंगे वे लीड के नोट में रखे जाएँगे।'],
      ['Press “Test” here, then send one real enquiry and look at the list below.', 'यहाँ “टेस्ट” दबाएँ, फिर एक असली पूछताछ भेजें और नीचे की सूची देखें।'],
    ],
    META: [
      ['In Zapier or Make: Trigger = Facebook Lead Ads → New Lead (you connect your own Facebook page there).', 'Zapier या Make में: ट्रिगर = Facebook Lead Ads → New Lead (वहाँ अपना फ़ेसबुक पेज जोड़ें)।'],
      ['Action: Webhooks → POST, payload type JSON, to the address below.', 'एक्शन: Webhooks → POST, पेलोड JSON, नीचे वाले पते पर।'],
      ['Map: full name → name, phone number → phone, email → email. The other questions of your lead form can go as extra fields — they are saved in the lead’s note.', 'जोड़ें: पूरा नाम → name, फ़ोन नंबर → phone, ई-मेल → email। लीड फ़ॉर्म के बाकी सवाल अलग फ़ील्ड में भेज सकते हैं — वे लीड के नोट में रहेंगे।'],
      ['Press “Test” here, then send one test lead from Meta’s lead-ads tool.', 'यहाँ “टेस्ट” दबाएँ, फिर Meta के लीड-ऐड टूल से एक टेस्ट लीड भेजें।'],
    ],
    OTHER: [
      ['Any tool that can send a web request (POST) works — JSON or form fields.', 'जो भी टूल वेब रिक्वेस्ट (POST) भेज सके वह चलेगा — JSON या फ़ॉर्म फ़ील्ड।'],
      ['Send at least name and phone (10-digit mobile). Message, email, budget, bhk are read too.', 'कम से कम name और phone (10 अंक का मोबाइल) भेजें। message, email, budget, bhk भी पढ़े जाते हैं।'],
      ['Press “Test” here, then send one real enquiry.', 'यहाँ “टेस्ट” दबाएँ, फिर एक असली पूछताछ भेजें।'],
    ],
  };
  if (inlet.kind === 'FORM') return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs" data-testid="inlet-guide">
      <p className="font-semibold">{tx('1 · Share this link', '1 · यह लिंक शेयर करें')}</p>
      <p className="text-slate-600">{tx('A ready enquiry form opens — put it on WhatsApp, an ad, your Instagram bio or a QR poster.', 'एक तैयार पूछताछ फ़ॉर्म खुलता है — इसे WhatsApp, विज्ञापन, इंस्टाग्राम बायो या QR पोस्टर पर लगाएँ।')}</p>
      <div className="flex items-center gap-1.5"><input readOnly value={url} className={`${inp} font-mono text-[11px]`} onFocus={e => e.currentTarget.select()} aria-label="URL" /><button type="button" className={btnLine} onClick={() => copy(url)}><Copy className="h-3.5 w-3.5" />{tx('Copy', 'कॉपी')}</button></div>
      <p className="pt-1 font-semibold">{tx('2 · Or put the form on your own website', '2 · या फ़ॉर्म अपनी वेबसाइट पर लगाएँ')}</p>
      {html ? <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-2.5 text-[10px] leading-snug text-slate-100">{html}</pre> : null}
      <div className="flex gap-1.5">
        <button type="button" className={btnLine} onClick={async () => { const h = html || (await api.inletSnippet(inlet.id)).html; setHtml(h); copy(h); }}><Code2 className="h-3.5 w-3.5" />{tx('Copy the form (HTML)', 'फ़ॉर्म कॉपी करें (HTML)')}</button>
      </div>
      <p className="text-[11px] text-slate-500">{tx('The form has a tick-box for the customer’s agreement and a hidden trap for robots. Do not remove them.', 'फ़ॉर्म में ग्राहक की सहमति का टिक-बॉक्स और रोबोट के लिए छिपा जाल है। इन्हें न हटाएँ।')}</p>
      {flash && <p className="font-semibold text-emerald-700">{flash}</p>}
    </div>
  );
  const list = steps[inlet.channel] || steps.OTHER;
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs" data-testid="inlet-guide">
      <ol className="list-decimal space-y-1.5 pl-4 text-slate-700">{list.map(([en, hi], i) => <li key={i}>{tx(en, hi)}</li>)}</ol>
      <p className="pt-1 font-semibold">{tx('Your address (POST here)', 'आपका पता (यहाँ POST करें)')}</p>
      <div className="flex items-center gap-1.5"><input readOnly value={url} className={`${inp} font-mono text-[11px]`} onFocus={e => e.currentTarget.select()} aria-label="URL" /><button type="button" className={btnLine} onClick={() => copy(url)}><Copy className="h-3.5 w-3.5" />{tx('Copy', 'कॉपी')}</button></div>
      <details className="text-[11px]"><summary className="cursor-pointer font-semibold text-slate-700">{tx('Show a sample request', 'नमूना रिक्वेस्ट देखें')}</summary>
        <pre className="mt-1.5 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-2.5 text-[10px] leading-snug text-slate-100">{curl}</pre>
        <button type="button" className={`${btnLine} mt-1.5`} onClick={() => copy(curl)}><Copy className="h-3.5 w-3.5" />{tx('Copy sample', 'नमूना कॉपी करें')}</button>
      </details>
      <p className="text-[11px] text-slate-500">{tx('The secret is in the address — anyone who has it can send enquiries. If it leaks, use “New secret”.', 'गुप्त कोड पते में ही है — जिसके पास पता है वह पूछताछ भेज सकता है। लीक हो जाए तो “नया गुप्त पता” दबाएँ।')}</p>
      {flash && <p className="font-semibold text-emerald-700">{flash}</p>}
    </div>
  );
};

const InletCard: React.FC<{ inlet: any; open: boolean; onToggle: () => void; onChanged: () => void }> = ({ inlet, open, onToggle, onChanged }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const { confirm } = useUI();
  const { busy, err, go } = useBusy();
  const [test, setTest] = useState<{ ok: boolean; why: string; hi: string } | null>(null);
  const [flash, setFlash] = useState('');
  const url = siteUrl(inlet.path);
  const c = inlet.counts;
  const chan = ({ WEBSITE: tx('Website form', 'वेबसाइट फ़ॉर्म'), PORTAL: tx('Property portal', 'प्रॉपर्टी पोर्टल'), META: tx('Facebook / Instagram ads', 'फ़ेसबुक / इंस्टाग्राम ऐड'), OTHER: tx('Other tool', 'कोई और टूल') } as Record<string, string>)[inlet.channel];
  const nearCap = inlet.todayCount >= inlet.dailyCap * 0.8;
  return (
    <article className={`space-y-3 rounded-xl border bg-white p-3.5 ${inlet.active ? 'border-slate-200' : 'border-amber-300 bg-amber-50/40'}`} data-testid="inlet-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">{ICON[inlet.channel]}{chan}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${inlet.active ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-900'}`}>{inlet.active ? tx('Live', 'चालू') : tx('Paused', 'रुका हुआ')}</span>
          </div>
          <h3 className="mt-1 truncate text-sm font-bold text-slate-900">{inlet.label}</h3>
          <p className="truncate text-[11px] text-slate-500">{inlet.projectName}</p>
          <p className="text-[11px] text-slate-400">{tx('Last enquiry', 'आख़िरी पूछताछ')}: {ago(inlet.lastAt, hi)}</p>
        </div>
        <button type="button" onClick={onToggle} className={`${btnLine} shrink-0 whitespace-nowrap`} aria-expanded={open} data-testid="inlet-setup"><ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />{tx('Set-up', 'सेट-अप')}</button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <Mini n={c.received} label={tx('Received', 'आए')} />
        <Mini n={c.created} label={tx('New leads', 'नई लीड')} tone="text-emerald-700" />
        <Mini n={c.duplicate} label={tx('Already had', 'पहले से थे')} tone="text-sky-700" />
        <Mini n={c.rejected} label={tx('Not taken', 'नहीं ली')} tone={c.rejected ? 'text-amber-700' : undefined} />
      </div>
      <p className={`text-[10px] ${nearCap ? 'font-semibold text-red-600' : 'text-slate-400'}`}>{tx(`Today ${inlet.todayCount} of ${inlet.dailyCap} allowed`, `आज ${inlet.todayCount} / ${inlet.dailyCap} की सीमा`)}</p>

      {open && <Guide inlet={inlet} url={url} />}

      <div className="flex flex-wrap gap-1.5">
        {inlet.kind === 'FORM' && <button type="button" className={btnLine} onClick={async () => { setFlash((await copyText(url)) ? tx('Link copied', 'लिंक कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ')); setTimeout(() => setFlash(''), 1800); }}><Link2 className="h-3.5 w-3.5" />{tx('Copy form link', 'फ़ॉर्म लिंक')}</button>}
        <button type="button" disabled={busy} className={btnLine} data-testid="inlet-test" onClick={() => go(async () => { const r = await api.inletTest(inlet.id); setTest({ ok: r.ok, why: r.why, hi: r.hi }); }, () => { /* shown below */ })}><FlaskConical className="h-3.5 w-3.5" />{tx('Test', 'टेस्ट')}</button>
        <button type="button" disabled={busy} className={btnLine} onClick={() => go(() => api.inletUpdate(inlet.id, { active: !inlet.active }), onChanged)}>{inlet.active ? <><Pause className="h-3.5 w-3.5" />{tx('Pause', 'रोकें')}</> : <><Play className="h-3.5 w-3.5" />{tx('Switch on', 'चालू करें')}</>}</button>
        <button type="button" disabled={busy} className={btnLine} onClick={async () => { if (await confirm(tx('Rotate Secret Address', 'नया गुप्त पता बनाएँ'), tx('Make a new secret address? The old link stops working at once — update it wherever you pasted it.', 'नया गुप्त पता बनाएँ? पुराना लिंक तुरंत बंद हो जाएगा — जहाँ लगाया है वहाँ बदलें।'))) go(() => api.inletRotate(inlet.id), onChanged); }}><RotateCw className="h-3.5 w-3.5" />{tx('New secret', 'नया गुप्त पता')}</button>
        <button type="button" disabled={busy} className={btnLine} onClick={async () => { if (await confirm(tx('Delete Address', 'पता हटाएँ'), tx('Delete this address? Its link stops working. Leads already made stay in your CRM.', 'यह पता हटाएँ? इसका लिंक बंद हो जाएगा। बन चुकी लीड CRM में रहेंगी।'), { danger: true })) go(() => api.inletDelete(inlet.id), onChanged); }}><Trash2 className="h-3.5 w-3.5" />{tx('Delete', 'हटाएँ')}</button>
      </div>
      <Err msg={err} />
      {flash && <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-center text-xs font-semibold text-white">{flash}</div>}
      {test && (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium ${test.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`} data-testid="inlet-test-result">
          {test.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{hi && test.hi ? test.hi : test.why}</span>
        </div>
      )}

      {inlet.log.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold text-slate-600">{tx('Latest enquiries', 'हाल की पूछताछ')}</div>
          <ul className="divide-y divide-slate-100 text-[11px]" data-testid="inlet-log">
            {inlet.log.slice(0, 6).map((l: any, i: number) => (
              <li key={i} className="flex items-start justify-between gap-2 py-1.5">
                <div className="min-w-0"><span className={`mr-1.5 inline-block rounded px-1.5 py-px text-[9px] font-bold ${OUT_STYLE[l.outcome] || 'bg-slate-100'}`}>{({ CREATED: tx('New lead', 'नई लीड'), DUPLICATE: tx('Already had', 'पहले से'), REJECTED: tx('Not taken', 'नहीं ली'), LIMIT: tx('Daily limit', 'रोज़ की सीमा') } as Record<string, string>)[l.outcome]}</span><b>{l.who || '—'}</b><span className="block truncate text-slate-500">{l.why}</span></div>
                <span className="shrink-0 text-slate-400">{ago(l.at, hi)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
};

/** the three-question wizard: where do the enquiries come from → which project → confirm agreement */
const NewInletSheet: React.FC<{ data: { projects: any[]; channels: any[] }; onClose: () => void; onMade: (inlet: any) => void }> = ({ data, onClose, onMade }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const { busy, err, go } = useBusy();
  const [channel, setChannel] = useState(''); const [projectId, setProjectId] = useState(data.projects.length === 1 ? data.projects[0].id : '');
  const [label, setLabel] = useState(''); const [ok, setOk] = useState(false);
  const ch = data.channels.find(c => c.id === channel);
  const defLabel = ({ WEBSITE: 'Website enquiry form', PORTAL: 'Property portal', META: 'Facebook / Instagram ads', OTHER: 'Other tool' } as Record<string, string>)[channel] || '';
  return (
    <Sheet title={tx('New lead address', 'नया लीड पता')} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div>
          <div className="mb-1.5 font-bold text-slate-800">{tx('1 · Where do the enquiries come from?', '1 · पूछताछ कहाँ से आएगी?')}</div>
          <div className="grid grid-cols-1 gap-1.5">
            {data.channels.map(c => (
              <button key={c.id} type="button" onClick={() => setChannel(c.id)} aria-pressed={channel === c.id} data-testid={`inlet-ch-${c.id}`}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left ${channel === c.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-800 hover:border-slate-900'}`}>
                {ICON[c.id]}<span className="font-semibold">{hi ? c.hi : c.en}</span>
              </button>
            ))}
          </div>
          {channel && channel !== 'WEBSITE' && <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">{tx('GENZ is not connected directly to 99acres, MagicBricks, Housing.com or Facebook — they send leads only to their own approved partners. You connect them with Zapier or Make (no coding): we give you the address and the steps.', 'GENZ सीधे 99acres, MagicBricks, Housing.com या फ़ेसबुक से जुड़ा नहीं है — वे लीड सिर्फ़ अपने मंज़ूर पार्टनर को भेजते हैं। आप Zapier या Make (बिना कोडिंग) से जोड़ते हैं: हम पता और स्टेप देते हैं।')}</p>}
        </div>
        {channel && (
          <>
            <div>
              <div className="mb-1.5 font-bold text-slate-800">{tx('2 · Which project?', '2 · कौन सा प्रोजेक्ट?')}</div>
              {data.projects.length === 0
                ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{tx('You have no live project to point it at. A broker needs an active partnership with a builder; a builder needs a project.', 'कोई चालू प्रोजेक्ट नहीं है। ब्रोकर के पास बिल्डर के साथ चालू पार्टनरशिप होनी चाहिए; बिल्डर के पास प्रोजेक्ट।')}</p>
                : <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inp} data-testid="inlet-project"><option value="">{tx('— choose —', '— चुनें —')}</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.locality || p.city}{p.paused ? ` (${tx('intake paused', 'इनटेक रुका')})` : ''}</option>)}</select>}
            </div>
            <div>
              <div className="mb-1.5 font-bold text-slate-800">{tx('3 · Give it a name you will recognise', '3 · ऐसा नाम दें जो आप पहचानें')}</div>
              <input value={label} onChange={e => setLabel(e.target.value)} maxLength={60} placeholder={defLabel} className={inp} data-testid="inlet-label" />
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-[11px] leading-snug">
              <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" data-testid="inlet-consent" />
              <span><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-700" />{tx('I confirm that people who reach this address have agreed to be contacted about this project — a ticked box on my form, or the portal’s / Meta’s own consent. I will keep the proof. GENZ records this statement with every lead.', 'मैं पुष्टि करता/करती हूँ कि इस पते पर आने वाले लोगों ने इस प्रोजेक्ट के बारे में संपर्क के लिए सहमति दी है — मेरे फ़ॉर्म का टिक-बॉक्स, या पोर्टल / Meta की अपनी सहमति। मैं इसका सबूत रखूँगा/रखूँगी। GENZ हर लीड के साथ यह बयान दर्ज करता है।')}</span>
            </label>
          </>
        )}
        <Err msg={err} />
        <button type="button" disabled={busy || !channel || !projectId || !ok} data-testid="inlet-make" className={`${btnDark} w-full`}
          onClick={() => go(async () => { const r = await api.inletCreate({ projectId, channel, label: (label || defLabel).trim(), consent: true }); onMade(r.inlet); }, onClose)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{tx('Make the address', 'पता बनाएँ')}
        </button>
        {ch && <p className="text-center text-[10px] text-slate-400">{tx('Every enquiry goes through the same checks as a lead you type: duplicate protection, the builder’s intake switch, your mandate.', 'हर पूछताछ वही जाँच पार करती है जो हाथ से भरी लीड करती है: डुप्लिकेट सुरक्षा, बिल्डर का इनटेक स्विच, आपका मैंडेट।')}</p>}
      </div>
    </Sheet>
  );
};

export const LeadInletsPanel: React.FC = () => {
  const tx = useTx();
  const [data, setData] = useState<{ inlets: any[]; projects: any[]; channels: any[]; limits: { perOwner: number; dailyCap: number } } | null>(null);
  const [err, setErr] = useState(''); const [making, setMaking] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => { try { setData(await api.inlets()); setErr(''); } catch (e: any) { setErr(e.message || 'Failed'); } }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  if (!data) return err ? <Err msg={err} /> : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;
  const full = data.inlets.length >= data.limits.perOwner;
  return (
    <div className="space-y-3" data-testid="inlets-panel">
      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Webhook className="h-4 w-4 text-slate-500" />{tx('Lead addresses', 'लीड पते')}</h2>
            <p className="mt-1 text-xs text-slate-600">{tx('Customers from your website, a property portal or Facebook / Instagram ads land straight in your CRM — with the same duplicate protection as a lead you type.', 'आपकी वेबसाइट, प्रॉपर्टी पोर्टल या फ़ेसबुक / इंस्टाग्राम ऐड के ग्राहक सीधे आपके CRM में आ जाते हैं — हाथ से भरी लीड जैसी ही डुप्लिकेट सुरक्षा के साथ।')}</p>
          </div>
          <button type="button" disabled={full} onClick={() => setMaking(true)} className={`${btnDark} shrink-0`} data-testid="inlet-new"><Plus className="h-4 w-4" />{tx('New address', 'नया पता')}</button>
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{tx('Straight talk: GENZ is not directly connected to 99acres, MagicBricks, Housing.com or Meta. A website form works on its own; portals and ads connect through Zapier / Make (no coding) — each address shows the steps.', 'सीधी बात: GENZ सीधे 99acres, MagicBricks, Housing.com या Meta से जुड़ा नहीं है। वेबसाइट फ़ॉर्म अपने आप चलता है; पोर्टल और ऐड Zapier / Make (बिना कोडिंग) से जुड़ते हैं — हर पते में स्टेप दिए हैं।')}</p>
        {full && <p className="text-[11px] font-semibold text-amber-800">{tx(`You have ${data.limits.perOwner} addresses — delete one you no longer use to make a new one.`, `आपके ${data.limits.perOwner} पते हैं — नया बनाने के लिए कोई पुराना हटाएँ।`)}</p>}
      </section>
      <Err msg={err} />
      {data.inlets.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500" data-testid="inlets-empty">
          <Webhook className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          {tx('No address yet. Start with a website enquiry form — it takes a minute and needs no other tool.', 'अभी कोई पता नहीं। वेबसाइट पूछताछ फ़ॉर्म से शुरू करें — एक मिनट लगता है, किसी और टूल की ज़रूरत नहीं।')}
          <div className="mt-3"><button type="button" onClick={() => setMaking(true)} className={btnDark}><Plus className="h-4 w-4" />{tx('Make my first address', 'पहला पता बनाएँ')}</button></div>
        </div>
      )}
      <div className="space-y-3">
        {data.inlets.map(i => <InletCard key={i.id} inlet={i} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} onChanged={load} />)}
      </div>
      {making && <NewInletSheet data={data} onClose={() => setMaking(false)} onMade={i => { setOpen(i.id); load(); }} />}
    </div>
  );
};
