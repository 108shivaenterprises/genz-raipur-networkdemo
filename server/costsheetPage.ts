/**
 * v106 — the customer's page of ONE unit's cost sheet (`/s/<token>`, kind COSTSHEET). The figures are the snapshot taken the day the sheet was made, so a later
 * rate change never alters a quote already sent; the sheet is valid for a few days and then shows no numbers at all. It is an indicative quote — never an offer.
 * Printable (Print / Save as PDF). No builder commission, no buyer or owner details; only the sending firm's contact card.
 */
import type { CostSheetSnapshot } from '../src/shared/costSheetRules.js';
import { sheetExpired } from '../src/shared/costSheetRules.js';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const day = (iso: string, lang: 'en' | 'hi') => new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });

const CS = {
  en: {
    head: 'Cost sheet', unit: 'Unit', forWho: 'Prepared for', valid: 'Valid until', expiredT: 'This cost sheet has expired', expiredB: 'The figures on a cost sheet hold only for a few days. Ask for a fresh one.',
    base: 'Price of the unit', extra: 'Other charges', before: 'Price + charges', gst: 'GST', onWhat: 'on', payable: 'Total payable to the builder', govt: 'Government charges (estimate)',
    stamp: 'Stamp duty', reg: 'Registration', allIn: 'All-in cost to you', noGst: 'no GST', sched: 'Payment schedule', schedNote: 'The schedule runs on the price + charges + GST (₹',
    day0: 'At booking', dayN: 'About {n} days after booking', note: 'From the builder', print: 'Print / Save as PDF', by: 'Prepared by', call: 'Call', wa: 'WhatsApp', rera: 'RERA',
    gone: 'This unit may have been sold or put on hold since this sheet was made — please confirm with the sender before you decide.',
    legal: 'This is an indicative cost sheet, not an offer, allotment or agreement. GST, stamp duty and registration are estimates at the rates shown and can change with the law or the sub-registrar’s valuation; the final amounts are those in the agreement for sale. Verify the RERA registration and approvals before you pay anything.',
    area: 'sq ft', rate: 'per sq ft', floor: 'Floor', facing: 'facing',
  },
  hi: {
    head: 'कॉस्ट शीट', unit: 'यूनिट', forWho: 'किसके लिए', valid: 'मान्य तिथि', expiredT: 'यह कॉस्ट शीट पुरानी हो चुकी है', expiredB: 'कॉस्ट शीट के आँकड़े कुछ ही दिन मान्य रहते हैं। ताज़ा शीट माँगें।',
    base: 'यूनिट की कीमत', extra: 'अन्य शुल्क', before: 'कीमत + शुल्क', gst: 'जीएसटी', onWhat: 'पर', payable: 'बिल्डर को कुल देय', govt: 'सरकारी शुल्क (अनुमान)',
    stamp: 'स्टाम्प ड्यूटी', reg: 'रजिस्ट्रेशन', allIn: 'आपकी कुल लागत', noGst: 'जीएसटी नहीं', sched: 'भुगतान का क्रम', schedNote: 'यह क्रम कीमत + शुल्क + जीएसटी पर चलता है (₹',
    day0: 'बुकिंग पर', dayN: 'बुकिंग के लगभग {n} दिन बाद', note: 'बिल्डर की ओर से', print: 'प्रिंट / PDF सेव करें', by: 'तैयार करने वाले', call: 'कॉल', wa: 'व्हाट्सऐप', rera: 'रेरा',
    gone: 'यह शीट बनने के बाद यह यूनिट बिक चुकी हो सकती है या होल्ड पर हो सकती है — फ़ैसले से पहले भेजने वाले से पक्का कर लें।',
    legal: 'यह एक संकेतात्मक कॉस्ट शीट है — ऑफ़र, आवंटन या एग्रीमेंट नहीं। जीएसटी, स्टाम्प ड्यूटी और रजिस्ट्रेशन दिखाई गई दरों पर अनुमान हैं और क़ानून या सब-रजिस्ट्रार के मूल्यांकन से बदल सकते हैं; अंतिम रक़म एग्रीमेंट फ़ॉर सेल में लिखी रक़म होगी। कुछ भी चुकाने से पहले रेरा पंजीयन और अनुमतियाँ जाँच लें।',
    area: 'वर्ग फ़ुट', rate: 'प्रति वर्ग फ़ुट', floor: 'मंज़िल', facing: 'मुखी',
  },
} as const;

export interface CostBrand { displayName: string; company: string; tagline: string; reraId: string; logo: string; phone: string }

/** the page body of a cost sheet (the shell, the tracker script and the footer are added by the caller) */
export function costSheetPage(s: CostSheetSnapshot, o: { lang: 'en' | 'hi'; clientLabel: string; brand: CostBrand; unitMayBeGone: boolean; now?: number }): { title: string; sub: string; body: string; expired: boolean } {
  const t = CS[o.lang]; const b = o.brand; const expired = sheetExpired(s, o.now);
  const facts = [s.unit.config, s.unit.floor !== undefined ? `${t.floor} ${s.unit.floor}` : '', s.out.areaSqft ? `${s.out.areaSqft} ${t.area}` : '', s.unit.facing ? `${s.unit.facing} ${t.facing}` : ''].filter(Boolean).map(esc).join(' · ');
  const title = `${s.projectName} — ${t.head} ${s.unit.label}`;
  const wa = `https://wa.me/91${b.phone}?text=${encodeURIComponent(`Hello ${b.displayName}, I saw the cost sheet of ${s.unit.label} (${s.projectName}). Please share details.`)}`;
  const card = `<div class="card"><div class="broker">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}<div><div class="small" style="margin:0">${t.by}</div><b>${esc(b.displayName)}</b>${b.company ? `<div style="font-size:13px">${esc(b.company)}</div>` : ''}${b.reraId ? `<div style="font-size:12px;color:#555">${t.rera}: ${esc(b.reraId)}</div>` : ''}${b.tagline ? `<div style="font-size:12px;color:#555">${esc(b.tagline)}</div>` : ''}</div></div>
<div class="btns"><a class="call" href="tel:+91${esc(b.phone)}">${t.call}</a><a class="wa" href="${esc(wa)}">${t.wa}</a></div></div>`;
  const hero = `<div class="hero" data-sec="overview"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7">${t.head}</div><h1>${esc(s.projectName)}</h1><p>${t.unit} ${esc(s.unit.label)}${s.unit.group ? ` · ${esc(s.unit.group)}` : ''}${facts ? ` · ${facts}` : ''}</p>${s.reraNumber ? `<p style="font-size:12px;margin-top:6px">${t.rera}: ${esc(s.reraNumber)}</p>` : ''}</div>`;
  if (expired) {
    return { title, sub: s.unit.label, expired, body: `${hero}<div class="card" data-sec="plans"><h2>${t.expiredT}</h2><p style="font-size:14px;margin:0">${t.expiredB}</p></div>${card}<p class="small">${t.legal}</p>` };
  }
  const out = s.out; const row = (a: string, v: string, o2: { sub?: string; strong?: boolean; big?: boolean; muted?: boolean } = {}) =>
    `<div class="crow${o2.strong ? ' cs' : ''}${o2.big ? ' cb' : ''}${o2.muted ? ' cm' : ''}"><span>${a}${o2.sub ? `<small>${o2.sub}</small>` : ''}</span><b>${v}</b></div>`;
  const lines = out.lines.map(l => row(esc(l.label), inr(l.amount), { sub: `${esc(l.basis)}${l.gst ? '' : ` · ${t.noGst}`}` })).join('');
  const sheet = [
    row(t.base, inr(out.basic), { sub: out.ratePerSqft && out.areaSqft ? `${inr(out.ratePerSqft)} ${t.rate} × ${out.areaSqft} ${t.area}` : '' }),
    lines,
    out.lines.length ? row(t.before, inr(out.basic + out.extras), { strong: true }) : '',
    out.gstPct ? row(`${t.gst} @ ${out.gstPct}%`, inr(out.gst), { sub: `${t.onWhat} ${inr(out.agreementValue)}` }) : '',
    row(t.payable, inr(out.payable), { strong: true }),
    out.stampPct ? row(`${t.stamp} @ ${out.stampPct}%`, inr(out.stamp), { muted: true }) : '',
    out.regPct ? row(`${t.reg} @ ${out.regPct}%`, inr(out.reg), { muted: true }) : '',
    row(t.allIn, inr(out.allIn), { big: true }),
  ].join('');
  const sched = out.schedule.length ? `<div class="card" data-sec="plans"><h2>${t.sched}</h2>${out.schedule.map(p => `<div class="crow"><span>${esc(p.name)}<small>${p.pct}% · ${p.dueInDays ? t.dayN.replace('{n}', String(p.dueInDays)) : t.day0}</small></span><b>${inr(p.amount)}</b></div>`).join('')}<p class="small" style="margin-top:8px">${t.schedNote}${Math.round(out.schedule.reduce((a, p) => a + p.amount, 0)).toLocaleString('en-IN')}).</p></div>` : '';
  const body = `${hero}
${o.unitMayBeGone ? `<div class="card" style="border:1px solid #f0b429;background:#fff8e6;font-size:13px">${t.gone}</div>` : ''}
<div class="card" data-sec="plans"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;color:#444;margin-bottom:6px">${o.clientLabel ? `<span>${t.forWho}: <b>${esc(o.clientLabel)}</b></span>` : '<span></span>'}<span>${t.valid}: <b>${esc(day(s.validUntil, o.lang))}</b></span></div>${sheet}</div>
${sched}
${s.note ? `<div class="card"><h2>${t.note}</h2><p style="font-size:14px;margin:0;white-space:pre-wrap">${esc(s.note)}</p></div>` : ''}
${card}
<div class="btns noprint"><a class="call" href="#" id="pb" role="button">${t.print}</a></div>
<p class="small">${t.legal}</p>`;
  return { title, sub: s.unit.label, body, expired };
}

/** extra styles for the cost sheet (added to the shared page shell) */
export const COST_CSS = `.crow{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;font-size:14px;padding:8px 0;border-bottom:1px solid #eee}.crow:last-child{border:0}.crow small{display:block;font-size:11px;color:#777;margin-top:1px}.crow b{white-space:nowrap}
.crow.cs{background:#f6f8fc;margin:0 -16px;padding:9px 16px;border-bottom:1px solid #e5e9f2}.crow.cm{color:#555}.crow.cb{background:#14213d;color:#fff;margin:6px -16px -16px;padding:14px 16px;border-radius:0 0 14px 14px;font-size:16px}.crow.cb small{color:#cbd5e1}
@media print{body{background:#fff}.noprint,.btns{display:none!important}.w{max-width:none;padding:0}.card{box-shadow:none;border:1px solid #ddd;break-inside:avoid}.hero{background:#fff!important;color:#000!important;border:1px solid #14213d}.crow.cb{background:#fff!important;color:#000!important;border-top:2px solid #14213d}}`;
