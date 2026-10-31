import React, { useCallback, useEffect, useState } from 'react';
import { useTx } from '../lib/i18n.js';
import { Loader2, Plus, ShieldAlert, ShieldCheck, ShieldQuestion, Trash2, ExternalLink } from 'lucide-react';
import { api } from '../lib/api.js';
import { UserProfile } from '../types/index.js';
import { INDIA_STATES } from '../shared/india.js';
import { RED_FLAG_HI, SEVERITY_HI } from '../shared/redflags.js';

const VERDICT: Record<string, { cls: string; label: string; Icon: any }> = {
  CLEAR: { cls: 'bg-emerald-100 text-emerald-900 border-emerald-400', label: 'Clear', Icon: ShieldCheck },
  CAUTION: { cls: 'bg-amber-100 text-amber-900 border-amber-400', label: 'Caution', Icon: ShieldQuestion },
  DANGER: { cls: 'bg-red-100 text-red-900 border-red-400', label: 'Danger', Icon: ShieldAlert },
};
const SEV: Record<string, string> = { HIGH: 'text-red-700', MEDIUM: 'text-amber-700', LOW: 'text-slate-500' };

const blank = () => ({
  title: '', state: '', district: '', tehsil: '', village: '', khasraNo: '', areaText: '', propertyId: '', encumbranceNote: '', sourceNote: '', markVerified: true,
  fields: { landUse: 'RESIDENTIAL', diverted: true, diversionOrderNo: '', ownerNameOnRecord: '', sellerName: '', encumbrance: 'NOT_CHECKED', bankNoc: 'NOT_REQUIRED', approvalAuthority: 'NONE', approvalNo: '', reraNo: '', isLayoutOrProject: false, sharedOwnership: false, coOwnersConsent: false },
});

const cls = 'w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs';
const Sel: React.FC<{ v: string; on: (v: string) => void; opts: [string, string][] }> = ({ v, on, opts }) => (
  <select value={v} onChange={e => on(e.target.value)} className={cls}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
);

export const LandRecordsView: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const tx = useTx();
  const [records, setRecords] = useState<any[]>([]);
  const [props, setProps] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const [a, b] = await Promise.all([api.lrList(), api.lrProperties()]); setRecords(a.records); setProps(b.properties); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setF = (patch: any) => setForm({ ...form, ...patch });
  const setFld = (patch: any) => setForm({ ...form, fields: { ...form.fields, ...patch } });
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const body = { ...form, propertyId: form.propertyId || undefined };
      await api.lrSave(editId, body); setForm(null); setEditId(null); setMsg({ ok: true, text: tx('Record saved','रिकॉर्ड सेव हो गया') }); await load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const f = form?.fields;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{tx('Land Records & Red Flags', 'भूमि रिकॉर्ड और रेड फ़्लैग')}</h2>
          <p className="max-w-2xl text-xs text-slate-500">{tx('You enter the khasra / land record here after checking your state land-record portal or tehsil. GENZ does not pull data from the portal — red flags are only as accurate as what you enter. Get a lawyer for the final call.','खसरा / भूमि रिकॉर्ड आप राज्य के भू-अभिलेख पोर्टल या तहसील से देखकर यहाँ भरते हैं। GENZ पोर्टल से डेटा नहीं उठाता — रेड फ़्लैग उतने ही सही हैं जितना आपने भरा। अंतिम निर्णय वकील से करवाएँ।')}</p>
        </div>
        <button onClick={() => { setForm(blank()); setEditId(null); }} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"><Plus className="h-4 w-4" /> {tx('New record', 'नया रिकॉर्ड')}</button>
      </div>
      {msg && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      {form && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs">
          <div className="text-sm font-bold">{editId ? tx('Edit record', 'रिकॉर्ड बदलें') : tx('New land record', 'नया भूमि रिकॉर्ड')}</div>
          <div className="grid gap-2 md:grid-cols-4">
            <input className={cls} placeholder={tx('Title (e.g. Tikrapara 2.5 acre)', 'शीर्षक (जैसे टिकरापारा 2.5 एकड़)')} value={form.title} onChange={e => setF({ title: e.target.value })} />
            <select className={cls} value={form.state} onChange={e => setF({ state: e.target.value })}><option value="">{tx('State / UT', 'राज्य / केंद्र शासित')}</option>{INDIA_STATES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}</select>
            <input className={cls} placeholder={tx('District', 'ज़िला')} value={form.district} onChange={e => setF({ district: e.target.value })} />
            <input className={cls} placeholder={tx('Tehsil', 'तहसील')} value={form.tehsil} onChange={e => setF({ tehsil: e.target.value })} />
            <input className={cls} placeholder={tx('Village / ward', 'गाँव / वार्ड')} value={form.village} onChange={e => setF({ village: e.target.value })} />
            <input className={cls} placeholder={tx('Khasra / survey no.', 'खसरा / सर्वे नं.')} value={form.khasraNo} onChange={e => setF({ khasraNo: e.target.value })} />
            <input className={cls} placeholder={tx('Area (rakba) e.g. 1.02 ha', 'रकबा, जैसे 1.02 हेक्टेयर')} value={form.areaText} onChange={e => setF({ areaText: e.target.value })} />
            <select className={cls} value={form.propertyId} onChange={e => setF({ propertyId: e.target.value })}><option value="">{tx('Not linked to a property','प्रॉपर्टी से लिंक नहीं')}</option>{props.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <label>{tx('Land use (as per record)','भूमि उपयोग (रिकॉर्ड अनुसार)')}<Sel v={f.landUse} on={v => setFld({ landUse: v })} opts={[['AGRICULTURAL', tx('Agricultural','कृषि')], ['RESIDENTIAL', tx('Residential', 'रिहायशी')], ['COMMERCIAL', tx('Commercial', 'कमर्शियल')], ['INDUSTRIAL', tx('Industrial', 'औद्योगिक')], ['NAZUL', tx('Nazul / government','नज़ूल / सरकारी')], ['OTHER', tx('Other', 'अन्य')]]} /></label>
            <label>{tx('Diverted (vyapavartan) done?', 'व्यपवर्तन (डायवर्जन) हुआ?')}<Sel v={f.diverted ? 'Y' : 'N'} on={v => setFld({ diverted: v === 'Y' })} opts={[['Y', tx('Yes','हाँ')], ['N', tx('No', 'नहीं')]]} /></label>
            <label>{tx('Diversion order no.', 'डायवर्जन आदेश नं.')}<input className={cls} value={f.diversionOrderNo} onChange={e => setFld({ diversionOrderNo: e.target.value })} /></label>
            <label>{tx('Owner name (on record)', 'मालिक का नाम (रिकॉर्ड पर)')}<input className={cls} value={f.ownerNameOnRecord} onChange={e => setFld({ ownerNameOnRecord: e.target.value })} /></label>
            <label>{tx('Seller name (in deal)','विक्रेता का नाम (डील में)')}<input className={cls} value={f.sellerName} onChange={e => setFld({ sellerName: e.target.value })} /></label>
            <label>{tx('Encumbrance / charge','भार / बोझ')}<Sel v={f.encumbrance} on={v => setFld({ encumbrance: v })} opts={[['NOT_CHECKED', tx('Not checked','जाँचा नहीं')], ['CLEAR', tx('Clear', 'साफ़')], ['MORTGAGE', tx('Bank mortgage', 'बैंक गिरवी')], ['LITIGATION', tx('Court case / attachment', 'कोर्ट केस / कुर्की')], ['OTHER_CHARGE', tx('Other charge','कोई और भार')]]} /></label>
            <label>{tx('Bank NOC', 'बैंक NOC')}<Sel v={f.bankNoc} on={v => setFld({ bankNoc: v })} opts={[['NOT_REQUIRED', tx('Not required','आवश्यक नहीं')], ['PENDING', tx('Pending', 'बाकी')], ['RECEIVED', tx('Received','मिल गया')]]} /></label>
            <label>{tx('Is it a layout / project?','क्या यह लेआउट / प्रोजेक्ट है?')}<Sel v={f.isLayoutOrProject ? 'Y' : 'N'} on={v => setFld({ isLayoutOrProject: v === 'Y' })} opts={[['N', tx('No (single plot/land)','नहीं (एकल प्लॉट/भूमि)')], ['Y', tx('Yes','हाँ')]]} /></label>
            {f.isLayoutOrProject && <>
              <label>{tx('Approval authority', 'मंज़ूरी देने वाला प्राधिकरण')}<Sel v={f.approvalAuthority} on={v => setFld({ approvalAuthority: v })} opts={[['NONE', tx('None','कोई नहीं')], ['TOWN_COUNTRY_PLANNING', tx('Town & Country Planning (TNCP)', 'नगर तथा ग्राम निवेश (TNCP)')], ['GRAM_PANCHAYAT', tx('Gram Panchayat', 'ग्राम पंचायत')], ['MUNICIPAL', tx('Municipal Corporation','नगर निगम / पालिका')], ['DEVELOPMENT_AUTHORITY', tx('Development Authority', 'विकास प्राधिकरण')], ['OTHER', tx('Other', 'अन्य')]]} /></label>
              <label>{tx('Approval / permit no.', 'मंज़ूरी / परमिट नं.')}<input className={cls} value={f.approvalNo} onChange={e => setFld({ approvalNo: e.target.value })} /></label>
              <label>{tx('RERA no.', 'RERA नं.')}<input className={cls} value={f.reraNo} onChange={e => setFld({ reraNo: e.target.value })} /></label>
            </>}
            <label>{tx('Joint ownership?', 'संयुक्त स्वामित्व?')}<Sel v={f.sharedOwnership ? 'Y' : 'N'} on={v => setFld({ sharedOwnership: v === 'Y' })} opts={[['N', tx('No', 'नहीं')], ['Y', tx('Yes','हाँ')]]} /></label>
            {f.sharedOwnership && <label>{tx('Consent of all co-owners?','सभी सह-स्वामियों की सहमति?')}<Sel v={f.coOwnersConsent ? 'Y' : 'N'} on={v => setFld({ coOwnersConsent: v === 'Y' })} opts={[['N', tx('Not obtained','नहीं मिली')], ['Y', tx('Obtained','मिल गई')]]} /></label>}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input className={cls} placeholder={tx('Encumbrance note (whose mortgage, case no.)', 'भार का नोट (किसका बंधक, केस नं.)')} value={form.encumbranceNote} onChange={e => setF({ encumbranceNote: e.target.value })} />
            <input className={cls} placeholder={tx('Source (which portal / office, when checked)', 'स्रोत (किस पोर्टल / दफ़्तर से, कब देखा)')} value={form.sourceNote} onChange={e => setF({ sourceNote: e.target.value })} />
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.markVerified} onChange={e => setF({ markVerified: e.target.checked })} /> {tx('I have checked these details myself against the official record (verified as of today)','मैंने ये विवरण आधिकारिक रिकॉर्ड से खुद मिलाए हैं (आज की तारीख से सत्यापित)')}</label>
          <div className="flex gap-2"><button disabled={busy} onClick={save} className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white">{busy ? '...' : tx('Save & scan', 'सेव और स्कैन')}</button><button onClick={() => { setForm(null); setEditId(null); }} className="rounded-lg border border-slate-300 px-3 py-2">Cancel</button></div>
        </div>
      )}

      {records.length === 0 && !form && <p className="py-10 text-center text-xs text-slate-400">{tx('No land records yet','अभी कोई भूमि रिकॉर्ड नहीं')}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {records.map(rec => {
          const v = VERDICT[rec.scan.verdict]; const mine = rec.createdBy === currentUser.id || ['ADMIN', 'SUPERADMIN', 'LEGAL_COUNSEL'].includes(currentUser.role);
          return (
            <div key={rec.id} className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-sm font-bold">{rec.title}</div><div className="text-slate-500">{tx('Khasra', 'खसरा')} {rec.khasraNo} · {rec.village || rec.tehsil}, {rec.district}, {rec.state}{rec.areaText ? ` · ${rec.areaText}` : ''}</div></div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 font-bold ${v.cls}`}><v.Icon className="h-3.5 w-3.5" /> {tx(v.label, ({ CLEAR: 'साफ़', CAUTION: 'सावधानी', DANGER: 'ख़तरा' } as Record<string, string>)[rec.scan.verdict] || v.label)}</span>
              </div>
              <ul className="mt-2 space-y-1">{rec.scan.flags.length === 0 ? <li className="text-emerald-700">{tx('No red flags found (based on what was entered).','कोई रेड फ़्लैग नहीं मिला (जो भरा गया उसके अनुसार)।')}</li> : rec.scan.flags.map((fl: any) => <li key={fl.code} className={SEV[fl.severity]}><b>{tx(fl.severity, SEVERITY_HI[fl.severity] || fl.severity)}</b> — {tx(fl.message, RED_FLAG_HI[fl.code] || fl.message)}</li>)}</ul>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                <span>{rec.fields.verifiedAt ? tx(`Verified ${new Date(rec.fields.verifiedAt).toLocaleDateString('en-IN')}`, `सत्यापित ${new Date(rec.fields.verifiedAt).toLocaleDateString('en-IN')}`) : tx('Not verified', 'सत्यापित नहीं')}</span>
                {rec.sourceNote && <span>{tx('Source', 'स्रोत')}: {rec.sourceNote}</span>}
                {mine && <button className="text-sky-700 underline" onClick={() => { setEditId(rec.id); setForm({ ...blank(), ...rec, propertyId: rec.propertyId || '', markVerified: false, fields: { ...blank().fields, ...rec.fields } }); }}>{tx('Edit', 'बदलें')}</button>}
                {mine && <button className="text-red-600" onClick={async () => { if (confirm(tx('Delete this record?', 'यह रिकॉर्ड हटा दें?'))) { await api.lrDelete(rec.id); load(); } }}><Trash2 className="inline h-3.5 w-3.5" /></button>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400">{tx('Look it up on your own state’s land-record portal — e.g. Bhulekh (UP, MP, Odisha), Apna Khata (Rajasthan), Bhoomi (Karnataka), 7/12 Mahabhulekh (Maharashtra), Jamabandi (Punjab, Haryana), Bhuiyan (Chhattisgarh).','अपने राज्य के भू-अभिलेख पोर्टल पर देखें — जैसे भूलेख (UP, MP, ओडिशा), अपना खाता (राजस्थान), भूमि (कर्नाटक), 7/12 महाभूलेख (महाराष्ट्र), जमाबंदी (पंजाब, हरियाणा), भुइयाँ (छत्तीसगढ़)।')} <ExternalLink className="inline h-3 w-3" /> {tx('Copy the portal data and enter it here yourself.','पोर्टल का डेटा खुद कॉपी करके यहाँ भरें।')}</p>
    </div>
  );
};
