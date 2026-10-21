/**
 * v26 — bypass protection ("anti-bypass tail"): how many days a broker's bond with a customer / owner is protected.
 *
 * One rule for the whole app (owner consent, owner mandate, deal room, offer, visit):
 *  - the broker picks 30 / 60 / 90 / 180 days, or any number of days ("custom");
 *  - never fewer than PROTECTION_MIN days and never more than the superadmin's maximum (`settings.bypassMaxDays`),
 *    which the superadmin sets from legal advice ("not exceeding the legal bond limit");
 *  - the superadmin's maximum itself can never go above PROTECTION_CEILING.
 * Pure — used by the server, the browser and the tests.
 */
export const PROTECTION_MIN = 7;
/** the absolute top the superadmin can set (2 years) */
export const PROTECTION_CEILING = 730;
/** the maximum until the superadmin changes it */
export const PROTECTION_DEFAULT_MAX = 180;
export const PROTECTION_DEFAULT_DAYS = 30;
export const PROTECTION_PRESETS = [30, 60, 90, 180] as const;

export interface ProtectionConfig { max: number; defaultDays: number; presets: number[]; min: number }

/** settings → the config the screens use (presets above the maximum are dropped; the maximum itself is offered as a preset) */
export function protectionConfig(s: { bypassMaxDays?: number; defaultProtectionPeriodDays?: number } | undefined): ProtectionConfig {
  const max = clampMax(s?.bypassMaxDays);
  const defaultDays = Math.min(max, Math.max(PROTECTION_MIN, Math.round(Number(s?.defaultProtectionPeriodDays) || PROTECTION_DEFAULT_DAYS)));
  const presets: number[] = PROTECTION_PRESETS.filter(d => d <= max);
  if (!presets.includes(max)) presets.push(max);
  return { max, defaultDays, presets, min: PROTECTION_MIN };
}

export function clampMax(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return PROTECTION_DEFAULT_MAX;
  return Math.min(PROTECTION_CEILING, Math.max(PROTECTION_MIN, n));
}

export interface ProtectionProblem { code: string; en: string; hi: string }

/** null when `days` is allowed under this config */
export function protectionProblem(days: unknown, cfg: ProtectionConfig): ProtectionProblem | null {
  const n = Number(days);
  if (!Number.isInteger(n)) return { code: 'PROTECTION_WHOLE', en: 'Protection days must be a whole number.', hi: 'सुरक्षा के दिन पूरी संख्या में लिखें।' };
  if (n < cfg.min) return { code: 'PROTECTION_SHORT', en: `Protection must be at least ${cfg.min} days.`, hi: `सुरक्षा कम से कम ${cfg.min} दिन की होनी चाहिए।` };
  if (n > cfg.max) return { code: 'PROTECTION_OVER_MAX', en: `GENZ allows at most ${cfg.max} days of protection (set by the superadmin).`, hi: `GENZ में ज़्यादा से ज़्यादा ${cfg.max} दिन की सुरक्षा मिलती है (सुपरएडमिन ने तय की है)।` };
  return null;
}

/** an untrusted number from a form → days that are always inside the rule (used where the old code had a fixed default) */
export function safeDays(days: unknown, cfg: ProtectionConfig): number {
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n <= 0) return cfg.defaultDays;
  return Math.min(cfg.max, Math.max(cfg.min, n));
}

export const daysLabel = (d: number, hi: boolean) => {
  if (d % 30 === 0 && d >= 60) return hi ? `${d} दिन (${d / 30} महीने)` : `${d} days (${d / 30} months)`;
  return hi ? `${d} दिन` : `${d} days`;
};

export const PROTECTION_EXPLAIN = {
  en: 'For these days the customer cannot be taken away from you: if the deal closes through anyone else on GENZ, you are on record as the broker who brought them.',
  hi: 'इतने दिन तक ग्राहक आपसे छीना नहीं जा सकता: GENZ पर किसी और के ज़रिए भी सौदा हुआ, तो रिकॉर्ड में आप ही उन्हें लाने वाले ब्रोकर रहेंगे।',
} as const;
