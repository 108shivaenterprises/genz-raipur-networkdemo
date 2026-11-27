import React, { useCallback, useEffect, useState } from 'react';
import {
  Coins,
  Save,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

interface SlabRow {
  minInvoiceInr: number;
  maxDiscountPct: number;
}

interface CoinsConfigForm {
  enabled: boolean;
  rewardPct: number;
  validityDays: number;
  minDealValueInr: number;
  maxCoinCapInr: number;
  slabs: SlabRow[];
  termsAndConditions: string;
}

const DEFAULT_FORM: CoinsConfigForm = {
  enabled: true,
  rewardPct: 1,
  validityDays: 180,
  minDealValueInr: 1_000_000,
  maxCoinCapInr: 100_000,
  slabs: [
    { minInvoiceInr: 25_000, maxDiscountPct: 10 },
    { minInvoiceInr: 100_000, maxDiscountPct: 15 },
    { minInvoiceInr: 500_000, maxDiscountPct: 20 },
  ],
  termsAndConditions:
    '1. 1 GENZ Mudra = ₹1 discount credit with affiliated GENZ partners only (zero hard cash).\n2. Discount is capped by the invoice-value slab %.\n3. GENZ Mudra expires 180 days after credit.',
};

function getMudraStatusBadge(status: string, tx: (en: string, hi: string) => string): { label: string; cls: string } {
  switch (status) {
    case 'LOCKED_VISIT':
      return {
        label: tx('Stage 1 · Visit Scheduled', 'चरण 1 · विज़िट तय'),
        cls: 'bg-slate-200 text-slate-800',
      };
    case 'LOCKED_REGISTRY':
      return {
        label: tx('Stage 2 · Visit Verified', 'चरण 2 · विज़िट वेरिफ़ाइड'),
        cls: 'bg-amber-100 text-amber-900',
      };
    case 'ACTIVE':
      return {
        label: tx('Active', 'सक्रिय'),
        cls: 'bg-emerald-100 text-emerald-800',
      };
    case 'PARTIALLY_REDEEMED':
      return {
        label: tx('Partially Redeemed', 'आंशिक रिडीम'),
        cls: 'bg-teal-100 text-teal-800',
      };
    case 'REDEEMED':
      return {
        label: tx('Redeemed', 'रिडीम हुआ'),
        cls: 'bg-indigo-100 text-indigo-800',
      };
    case 'EXPIRED':
      return {
        label: tx('Expired', 'समाप्त'),
        cls: 'bg-rose-100 text-rose-800',
      };
    default:
      return {
        label: status || tx('Unknown', 'अज्ञात'),
        cls: 'bg-slate-100 text-slate-700',
      };
  }
}

export const SuperadminCoinsPanel: React.FC = () => {
  const tx = useTx();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingLedger, setRefreshingLedger] = useState(false);
  const [form, setForm] = useState<CoinsConfigForm>(DEFAULT_FORM);
  const [ledger, setLedger] = useState<any>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, ledRes] = await Promise.all([
        api.coinsConfig().catch(() => null),
        api.coinsAdminLedger().catch(() => null),
      ]);
      const cfg = cfgRes?.config ?? cfgRes;
      if (cfg && typeof cfg === 'object') {
        setForm({
          enabled: cfg.enabled ?? true,
          rewardPct: Number(cfg.rewardPct ?? 1),
          validityDays: Number(cfg.validityDays ?? 180),
          minDealValueInr: Number(cfg.minDealValueInr ?? 1_000_000),
          maxCoinCapInr: Number(cfg.maxCoinCapInr ?? 100_000),
          slabs: Array.isArray(cfg.slabs) && cfg.slabs.length > 0
            ? cfg.slabs.map((s: any) => ({
                minInvoiceInr: Number(s.minInvoiceInr ?? 0),
                maxDiscountPct: Number(s.maxDiscountPct ?? 0),
              }))
            : DEFAULT_FORM.slabs,
          termsAndConditions: typeof cfg.termsAndConditions === 'string'
            ? cfg.termsAndConditions
            : DEFAULT_FORM.termsAndConditions,
        });
      }
      setLedger(ledRes?.ledger ?? ledRes ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const refreshLedger = async () => {
    setRefreshingLedger(true);
    try {
      const ledRes = await api.coinsAdminLedger();
      setLedger(ledRes?.ledger ?? ledRes ?? {});
    } finally {
      setRefreshingLedger(false);
    }
  };

  const updateSlab = (idx: number, key: keyof SlabRow, val: number) => {
    setForm((prev) => ({
      ...prev,
      slabs: prev.slabs.map((s, i) => (i === idx ? { ...s, [key]: val } : s)),
    }));
  };

  const addSlab = () => {
    setForm((prev) => ({
      ...prev,
      slabs: [...prev.slabs, { minInvoiceInr: 50_000, maxDiscountPct: 10 }],
    }));
  };

  const removeSlab = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      slabs: prev.slabs.filter((_, i) => i !== idx),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const sortedSlabs = [...form.slabs].sort((a, b) => a.minInvoiceInr - b.minInvoiceInr);
      await api.updateCoinsConfig({ ...form, slabs: sortedSlabs });
      setForm((prev) => ({ ...prev, slabs: sortedSlabs }));
      setMsg({ ok: true, text: tx('GENZ Mudra Program settings saved.', 'GENZ मुद्रा प्रोग्राम सेटिंग्स सेव हो गईं।') });
      await refreshLedger();
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || tx('Failed to save settings.', 'सेटिंग्स सेव नहीं हो सकीं।') });
    } finally {
      setSaving(false);
    }
  };

  const totals = ledger?.totals ?? ledger ?? {};
  const totalIssued = Number(totals?.totalIssued ?? ledger?.issuedCoins ?? 0);
  const totalBurned = Number(totals?.totalBurned ?? totals?.totalRedeemed ?? ledger?.burnedCoins ?? 0);
  const totalExpired = Number(totals?.expiredBreakage ?? totals?.totalExpired ?? ledger?.expiredCoins ?? 0);
  const netMargin = Number(totals?.totalGenzMarginInr ?? totals?.netGenzMargin ?? totals?.netMarginInr ?? ledger?.marginEarned ?? 0);
  const entries: any[] = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const lockedVisitCount = entries.filter((e) => e.status === 'LOCKED_VISIT').length;
  const lockedRegistryCount = entries.filter((e) => e.status === 'LOCKED_REGISTRY').length;
  const activeCount = entries.filter((e) => e.status === 'ACTIVE' || e.status === 'PARTIALLY_REDEEMED').length;

  if (loading) {
    return (
      <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-8" data-testid="superadmin-coins-panel">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 md:p-0" data-testid="superadmin-coins-panel">
      {/* Live Ecosystem Ledger Summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <TrendingUp className="h-4 w-4 text-amber-600" />
            {tx('Live GENZ Mudra Program Ecosystem Ledger', 'लाइव GENZ मुद्रा प्रोग्राम इकोसिस्टम लेजर')}
          </h3>
          <button
            type="button"
            onClick={refreshLedger}
            disabled={refreshingLedger}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingLedger ? 'animate-spin' : ''}`} />
            {tx('Refresh', 'रीफ़्रेश')}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase text-slate-500">{tx('Total Mudra Issued', 'कुल जारी मुद्रा')}</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{formatINR(totalIssued)}</div>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
            <div className="text-[11px] font-semibold uppercase text-emerald-700">{tx('Burned / Redeemed', 'रिडीम / बर्न')}</div>
            <div className="mt-1 text-lg font-bold text-emerald-800">{formatINR(totalBurned)}</div>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3">
            <div className="text-[11px] font-semibold uppercase text-amber-800">{tx('Expired Breakage', 'समाप्त (ब्रेकेज)')}</div>
            <div className="mt-1 text-lg font-bold text-amber-900">{formatINR(totalExpired)}</div>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-3">
            <div className="text-[11px] font-semibold uppercase text-indigo-700">{tx('Net GENZ Margin', 'शुद्ध GENZ मार्जिन')}</div>
            <div className="mt-1 text-lg font-bold text-indigo-900">{formatINR(netMargin)}</div>
          </div>
        </div>

        {/* Stage Breakdown & Recent Mudra Ledger Entries */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-slate-200 px-2.5 py-0.5 font-semibold text-slate-800">
            {tx(`Stage 1 (Visit Scheduled): ${lockedVisitCount}`, `चरण 1 (विज़िट तय): ${lockedVisitCount}`)}
          </span>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-900">
            {tx(`Stage 2 (Visit Verified): ${lockedRegistryCount}`, `चरण 2 (विज़िट वेरिफ़ाइड): ${lockedRegistryCount}`)}
          </span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-800">
            {tx(`Stage 3 (Active): ${activeCount}`, `चरण 3 (सक्रिय): ${activeCount}`)}
          </span>
        </div>

        {entries.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">{tx('Deal / Entry', 'डील / एंट्री')}</th>
                  <th className="px-3 py-2 font-semibold">{tx('Issued', 'जारी')}</th>
                  <th className="px-3 py-2 font-semibold">{tx('Remaining', 'शेष')}</th>
                  <th className="px-3 py-2 font-semibold text-right">{tx('Status', 'स्थिति')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.slice(0, 8).map((entry: any) => {
                  const badge = getMudraStatusBadge(entry.status, tx);
                  return (
                    <tr key={entry.id}>
                      <td className="px-3 py-2 font-medium text-slate-800">{entry.dealId || entry.id}</td>
                      <td className="px-3 py-2 text-slate-700">{formatINR(Number(entry.coinsIssued ?? 0))}</td>
                      <td className="px-3 py-2 text-slate-700">{formatINR(Number(entry.coinsRemaining ?? 0))}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Superadmin Config Form */}
      <form onSubmit={handleSave} className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Coins className="h-4 w-4 text-amber-600" />
            {tx('GENZ Mudra Program Configuration', 'GENZ मुद्रा प्रोग्राम कॉन्फ़िगरेशन')}
          </h3>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            {form.enabled ? tx('GENZ Mudra Program Enabled', 'GENZ मुद्रा प्रोग्राम चालू') : tx('GENZ Mudra Program Disabled', 'GENZ मुद्रा प्रोग्राम बंद')}
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <label className="block text-xs">
            <span className="font-semibold text-slate-700">{tx('Reward % (0.5–2%+)', 'रिवॉर्ड % (0.5–2%+)')}</span>
            <input
              type="number"
              step="0.1"
              min={0.5}
              max={10}
              value={form.rewardPct}
              onChange={(e) => setForm({ ...form, rewardPct: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-slate-700">{tx('Validity (Days)', 'वैधता (दिन)')}</span>
            <input
              type="number"
              min={30}
              max={730}
              value={form.validityDays}
              onChange={(e) => setForm({ ...form, validityDays: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-slate-700">{tx('Min Deal Value (₹)', 'न्यूनतम डील मूल्य (₹)')}</span>
            <input
              type="number"
              min={0}
              step={50000}
              value={form.minDealValueInr}
              onChange={(e) => setForm({ ...form, minDealValueInr: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-slate-700">{tx('Max Mudra Cap (₹)', 'अधिकतम मुद्रा सीमा (₹)')}</span>
            <input
              type="number"
              min={0}
              step={5000}
              value={form.maxCoinCapInr}
              onChange={(e) => setForm({ ...form, maxCoinCapInr: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </label>
        </div>

        {/* Invoice-Value Slabs Editor */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
              {tx('Invoice-Value Discount Slabs', 'बिल मूल्य डिस्काउंट स्लैब')}
            </span>
            <button
              type="button"
              onClick={addSlab}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {tx('Add Slab', 'स्लैब जोड़ें')}
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {form.slabs.map((s, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <span>{tx('Min Invoice (₹)', 'न्यूनतम बिल (₹)')}</span>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={s.minInvoiceInr}
                    onChange={(e) => updateSlab(idx, 'minInvoiceInr', Number(e.target.value))}
                    className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <span>{tx('Max Discount (%)', 'अधिकतम छूट (%)')}</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={s.maxDiscountPct}
                    onChange={(e) => updateSlab(idx, 'maxDiscountPct', Number(e.target.value))}
                    className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeSlab(idx)}
                  disabled={form.slabs.length <= 1}
                  className="ml-auto rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                  title={tx('Remove slab', 'स्लैब हटाएँ')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Terms & Conditions */}
        <label className="block text-xs">
          <span className="font-semibold text-slate-700">{tx('Terms & Conditions (Shown to Clients)', 'नियम एवं शर्तें (क्लाइंट्स को दिखेंगी)')}</span>
          <textarea
            rows={4}
            value={form.termsAndConditions}
            onChange={(e) => setForm({ ...form, termsAndConditions: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
          />
        </label>

        {msg && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
            {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {tx('Save GENZ Mudra Program Settings', 'GENZ मुद्रा प्रोग्राम सेटिंग्स सेव करें')}
        </button>
      </form>
    </div>
  );
};
