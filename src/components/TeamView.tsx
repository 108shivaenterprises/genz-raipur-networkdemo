import React, { useCallback, useEffect, useState } from 'react';
import { useTx, useI18n } from '../lib/i18n.js';
import { TEAM_ROLES } from '../shared/crmSales.js';
import { Loader2, UserPlus, Copy, PauseCircle, PlayCircle, KeyRound, Share2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { TeamControl } from './TeamControl.js';

interface Cred { name: string; loginId: string; password: string }

const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

const ActivityTab: React.FC = () => {
  const tx = useTx();
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<any[]>([]);
  const [chk, setChk] = useState<any[]>([]);
  const [inc, setInc] = useState<{ rows: any[]; note: string } | null>(null);
  const [shot, setShot] = useState<string>('');
  useEffect(() => {
    api.teamActivity(days).then(r => setRows(r.rows)).catch(() => setRows([]));
    api.teamCheckins().then(r => setChk(r.checkins)).catch(() => setChk([]));
    api.teamIncentives().then(setInc).catch(() => setInc(null));
  }, [days]);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs">{tx('Last', 'पिछले')} <select value={days} onChange={e => setDays(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1">{[1, 7, 14, 30].map(d => <option key={d} value={d}>{d} {tx(d === 1 ? 'day' : 'days', 'दिन')}</option>)}</select></div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2.5">{tx('Who', 'कौन')}</th><th>{tx('Calls', 'कॉल')}</th><th>{tx('WhatsApp', 'WhatsApp')}</th><th>{tx('Meetings', 'मीटिंग')}</th><th>{tx('Site visits', 'साइट विज़िट')}</th><th>{tx('Open leads', 'खुली लीड')}</th><th>{tx('Overdue', 'देर')}</th><th>{tx('Booked', 'बुक')}</th><th>{tx('Deals', 'डील')}</th><th>{tx('Last check-in', 'आख़िरी चेक-इन')}</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id} className="border-t border-slate-100"><td className="p-2.5 font-medium">{r.name}<div className="text-[10px] font-normal text-slate-400">{r.title}</div></td>
              <td>{r.calls}</td><td>{r.whatsapp}</td><td>{r.meetings}</td><td>{r.siteVisits}</td><td>{r.openLeads}</td>
              <td className={r.overdueFollowUps ? 'font-semibold text-red-600' : ''}>{r.overdueFollowUps}</td><td>{r.booked}</td><td>{r.deals ?? '—'}</td>
              <td>{r.lastCheckinAt ? `${new Date(r.lastCheckinAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })} · ${r.lastCheckinLabel}` : '—'}</td></tr>
          ))}</tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-bold">{tx('Site check-ins (GPS + selfie)', 'साइट चेक-इन (GPS + सेल्फ़ी)')}</div>
        {chk.length === 0 ? <p className="text-xs text-slate-400">{tx('No check-ins yet','अभी कोई चेक-इन नहीं')}</p> : (
          <ul className="divide-y divide-slate-100 text-xs">{chk.slice(0, 30).map(c => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-36 font-medium">{c.userName}</span><span className="w-40 text-slate-500">{new Date(c.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span><span className="flex-1">{c.label}</span>
              <a className="text-sky-700 underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${c.lat},${c.lng}`}>{tx('Map', 'नक्शा')} (±{Math.round(c.accuracy || 0)} m)</a>
              {c.hasSelfie && <button className="text-slate-700 underline" onClick={async () => { try { setShot((await api.teamSelfie(c.id)).selfie); } catch { /* gone */ } }}>{tx('Selfie', 'सेल्फ़ी')}</button>}
            </li>))}</ul>
        )}
        {shot && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setShot('')}><img src={shot} alt="selfie" className="max-h-[80vh] rounded-xl" /></div>}
      </div>

      {inc && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 text-sm font-bold">{tx('Firm share vs agent incentive', 'फ़र्म का हिस्सा बनाम एजेंट इंसेंटिव')}</div>
          <table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-1">{tx('Member', 'सदस्य')}</th><th>{tx('Incentive %', 'इंसेंटिव %')}</th><th>{tx('Bookings', 'बुकिंग')}</th><th>{tx('Brokerage', 'ब्रोकरेज')}</th><th>{tx('Agent incentive', 'एजेंट इंसेंटिव')}</th><th>{tx('Firm share', 'फ़र्म का हिस्सा')}</th></tr></thead>
            <tbody>{inc.rows.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-slate-400">{tx('No members','कोई सदस्य नहीं')}</td></tr>}
              {inc.rows.map(r => <tr key={r.id} className="border-t border-slate-100"><td className="py-1.5">{r.name}</td><td>{r.incentivePct}%</td><td>{r.bookings}</td><td>{inr(r.brokerage)}</td><td>{inr(r.incentiveAccrued)}</td><td>{inr(r.firmShareAccrued)}</td></tr>)}</tbody></table>
          <p className="mt-2 text-[10px] text-slate-400">{inc.note}</p>
        </div>
      )}
    </div>
  );
};

/** `canControl`: lead routing / handover is a CRM feature, so only brokers and builders get that sub-tab (the server refuses everyone else). */
export const TeamView: React.FC<{ isBuilder?: boolean; canControl?: boolean }> = ({ isBuilder = false, canControl = true }) => {
  const tx = useTx(); const { lang } = useI18n();
  const [tab, setTab] = useState<'members' | 'control' | 'activity'>('members');
  const [members, setMembers] = useState<any[]>([]);
  const [max, setMax] = useState(15);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', title: '', role: 'TELECALLER', consent: false });
  const [busy, setBusy] = useState(false);
  const [cred, setCred] = useState<Cred | null>(null);

  const flash = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 4000); };
  const load = useCallback(async () => {
    try { const r = await api.teamList(); setMembers(r.members); setMax(r.max); }
    catch (e: any) { flash(false, e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.teamAdd({ name: form.name, phone: form.phone, role: form.role, ...(form.title.trim() ? { title: form.title.trim() } : {}), consentAttested: form.consent as true });
      setCred({ name: r.member.name, loginId: r.loginId, password: r.temporaryPassword });
      setForm({ name: '', phone: '', title: '', role: 'TELECALLER', consent: false });
      await load();
    } catch (err: any) { flash(false, err.message); } finally { setBusy(false); }
  };
  const toggle = async (m: any) => {
    try { await api.teamUpdate(m.id, { active: m.status !== 'VERIFIED' }); flash(true, m.status === 'VERIFIED' ? tx('Suspended', 'रोक दिया गया') : tx('Reactivated', 'फिर चालू किया')); await load(); }
    catch (e: any) { flash(false, e.message); }
  };
  const reset = async (m: any) => {
    try { const r = await api.teamReset(m.id); setCred({ name: m.name, loginId: r.loginId, password: r.temporaryPassword }); }
    catch (e: any) { flash(false, e.message); }
  };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareText = cred ? tx(`Your GENZ Broker Network account is ready.\nLogin: ${origin}\nMobile: ${cred.loginId}\nTemporary password: ${cred.password}\nYou must change the password at first login.`,`आपका GENZ Broker Network खाता बन गया है।\nलॉगिन: ${origin}\nमोबाइल: ${cred.loginId}\nअस्थायी पासवर्ड: ${cred.password}\nपहली बार लॉगिन पर पासवर्ड बदलना होगा।`) : '';

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const full = members.filter(m => m.status !== 'REJECTED').length >= max;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{tx('My Team', 'मेरी टीम')}</h2>
        <p className="text-xs text-slate-500">{tx('Add employees such as telecallers / site executives. They see only the leads and deal rooms you allot — commission, split and payout stay hidden from them.','टेलीकॉलर / साइट एक्ज़ीक्यूटिव जैसे कर्मचारी जोड़ें। वे केवल वही लीड और डील रूम देखते हैं जो आप आवंटित करते हैं — कमीशन, स्प्लिट और पेआउट उन्हें नहीं दिखता।')} ({members.length}/{max})</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200">
        {(['members', 'control', 'activity'] as const).filter(t => t !== 'control' || canControl).map(t => <button key={t} onClick={() => setTab(t)} data-testid={`team-tab-${t}`} className={`min-h-11 px-3 py-2 text-xs font-semibold capitalize ${tab === t ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-500'}`}>{t === 'members' ? tx('Members', 'सदस्य') : t === 'control' ? (isBuilder ? tx('Lead control', 'लीड कंट्रोल') : tx('Access & leads', 'पहुँच और लीड')) : tx('Activity & incentives', 'गतिविधि और इंसेंटिव')}</button>)}
      </div>
      {tab === 'activity' && <ActivityTab />}
      {tab === 'control' && <TeamControl isBuilder={isBuilder} />}
      {tab === 'members' && (<>
      {toast && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{toast.msg}</div>}

      {cred && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-slate-800">
          <div className="font-semibold">{cred.name} {tx('login (shown only once)','का लॉगिन (केवल एक बार दिखेगा)')}</div>
          <div className="mt-1">{tx('Mobile', 'मोबाइल')}: <b>{cred.loginId}</b> · {tx('Temporary password', 'अस्थायी पासवर्ड')}: <b className="font-mono">{cred.password}</b></div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => navigator.clipboard?.writeText(shareText)} className="inline-flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1.5 text-white"><Copy className="h-3.5 w-3.5" /> {tx('Copy', 'कॉपी')}</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1.5 text-white"><Share2 className="h-3.5 w-3.5" /> {tx('WhatsApp', 'WhatsApp')}</a>
            <button onClick={() => setCred(null)} className="rounded border border-slate-300 px-2.5 py-1.5">{tx('Done', 'हो गया')}</button>
          </div>
        </div>
      )}

      <form onSubmit={add} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input required placeholder={tx('Name', 'नाम')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
        <input required placeholder={tx('Mobile (10 digits)', 'मोबाइल (10 अंक)')} inputMode="numeric" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
        <div className="flex gap-2">
          <select required aria-label={tx('Role', 'भूमिका')} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs">{TEAM_ROLES.map(r => <option key={r.id} value={r.id}>{lang === 'hi' ? r.hi : r.en}</option>)}</select>
        </div>
        <button disabled={busy || full || !form.consent} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} {tx('Add member', 'सदस्य जोड़ें')}
        </button>
        <label className="flex items-start gap-2 text-[11px] text-slate-600 md:col-span-4">
          <input type="checkbox" checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} className="mt-0.5" />
          {tx('I confirm this employee has accepted the GENZ Privacy Policy and Terms, and customer data will be used only for work.','मैं पुष्टि करता/करती हूँ कि इस कर्मचारी ने GENZ की प्राइवेसी पॉलिसी और नियम स्वीकार किए हैं, और ग्राहक डेटा केवल काम के लिए उपयोग होगा।')}
        </label>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>
            <th className="p-2.5">{tx('Name', 'नाम')}</th><th>{tx('Mobile', 'मोबाइल')}</th><th>{tx('Role', 'भूमिका')}</th><th>{tx('Leads', 'लीड')}</th><th>{tx('Deals', 'डील')}</th><th>{tx('Incentive %', 'इंसेंटिव %')}</th><th>{tx('Last login', 'पिछला लॉगिन')}</th><th>{tx('Status', 'स्टेटस')}</th><th></th>
          </tr></thead>
          <tbody>
            {members.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-400">{tx('No team members yet','अभी कोई टीम सदस्य नहीं')}</td></tr>}
            {members.map(m => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="p-2.5 font-medium">{m.name}</td><td>{m.phone}</td><td>
                  <select value={m.teamRole || 'OTHER'} aria-label={tx('Role', 'भूमिका')} onChange={async e => { try { await api.teamUpdate(m.id, { teamRole: e.target.value }); flash(true, tx('Role saved', 'भूमिका सेव हुई')); await load(); } catch (err: any) { flash(false, err.message); } }} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]">{TEAM_ROLES.map(r => <option key={r.id} value={r.id}>{lang === 'hi' ? r.hi : r.en}</option>)}</select>
                  {m.teamTitle && m.teamTitle.toLowerCase() !== (TEAM_ROLES.find(r => r.id === m.teamRole)?.en || '').toLowerCase() && <span className="block text-[10px] text-slate-500">{m.teamTitle}</span>}
                </td>
                <td>{m.openLeads}/{m.leads}</td><td>{m.deals}</td><td><input defaultValue={m.incentivePct} onBlur={async e => { const v = Number(e.target.value); if (v !== m.incentivePct) { try { await api.teamUpdate(m.id, { incentivePct: v } as any); flash(true, tx('Incentive saved', 'इंसेंटिव सेव हुआ')); await load(); } catch (x: any) { flash(false, x.message); } } }} className="w-14 rounded border border-slate-300 px-1 py-0.5" /></td>
                <td>{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString('en-IN') : '—'}</td>
                <td><span className={m.status === 'VERIFIED' ? 'text-emerald-700' : 'text-red-600'}>{m.status === 'VERIFIED' ? tx('Active', 'चालू') : m.status}</span></td>
                <td className="space-x-2 whitespace-nowrap pr-2.5 text-right">
                  <button onClick={() => reset(m)} title={tx('New temporary password', 'नया अस्थायी पासवर्ड')} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"><KeyRound className="h-3.5 w-3.5" /> {tx('Reset', 'रीसेट')}</button>
                  {m.status !== 'BLACKLISTED' && (
                    <button onClick={() => toggle(m)} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">
                      {m.status === 'VERIFIED' ? <><PauseCircle className="h-3.5 w-3.5" /> {tx('Suspend', 'रोकें')}</> : <><PlayCircle className="h-3.5 w-3.5" /> {tx('Reactivate', 'फिर चालू करें')}</>}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  );
};
