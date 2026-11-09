/**
 * v114 — Reusable validation helpers for Indian real estate forms.
 * Used across CRM, onboarding, deal desk, partner, and connector flows.
 */

/** Indian mobile: starts with 6-9, exactly 10 digits */
export function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/[\s\-+]/g, '').replace(/^91/, '').replace(/^0/, ''));
}

/** Sanitise a raw phone input to just digits, stripping +91 / 0 prefix */
export function sanitizePhone(raw: string): string {
  return raw.replace(/[\s\-+]/g, '').replace(/^91/, '').replace(/^0/, '');
}

/** PAN: ABCDE1234F */
export function isValidPAN(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase().trim());
}

/** GSTIN: 22AAAAA0000A1Z5 */
export function isValidGSTIN(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.toUpperCase().trim());
}

/** RERA: state/authority prefix + alphanumerics (flexible for all states) */
export function isValidRERA(rera: string): boolean {
  return /^[A-Z]{2,5}[\-\/]?[A-Z0-9]{4,20}$/i.test(rera.trim());
}

/** UPI ID: user@bank */
export function isValidUPI(upi: string): boolean {
  return /^[a-zA-Z0-9._\-]{2,256}@[a-zA-Z]{2,64}$/.test(upi.trim());
}

/** Positive number (> 0), handles string inputs from forms */
export function isPositiveNumber(val: string | number): boolean {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return !isNaN(n) && isFinite(n) && n > 0;
}

/** Percentage: 0–100 inclusive */
export function isValidPercent(val: string | number): boolean {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return !isNaN(n) && isFinite(n) && n >= 0 && n <= 100;
}

/** Sanitise decimal input: allow only one decimal point, digits only */
export function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return parts[0] + '.' + parts.slice(1).join('');
}

/** Budget validation: min must be <= max */
export function isValidBudgetRange(min: number, max: number): boolean {
  return isPositiveNumber(min) && isPositiveNumber(max) && min <= max;
}

