/**
 * v26 — bypass protection days: one rule for the whole network.   /api/protection
 *
 *   GET  /config     (any signed-in member)   → { max, defaultDays, presets, min }
 *   PUT  /settings   (superadmin only)        → { maxDays?, defaultDays? }
 *
 * The superadmin's maximum (`settings.bypassMaxDays`) is the "legal bond limit": every place that sets protection days
 * (owner consent, owner mandate, deal room, offer) is checked against it with `checkDays()` / `daysFor()`.
 * Lowering the maximum never shortens a bond that already exists — it only limits new ones.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import { ctx, needs, requireAuth } from './auth.js';
import { protectionConfig, protectionProblem, safeDays, PROTECTION_CEILING, PROTECTION_MIN, type ProtectionConfig } from '../src/shared/protectionRules.js';

export function currentProtection(): ProtectionConfig {
  return protectionConfig(db.getState().settings as any);
}
/** null = allowed; otherwise the bilingual problem (send with status 400) */
export function checkDays(days: unknown) { return protectionProblem(days, currentProtection()); }
/** the days to use when nothing was chosen (or an old fixed default) — always inside the rule */
export function daysFor(days?: unknown) { const cfg = currentProtection(); return days === undefined || days === null || days === '' ? cfg.defaultDays : safeDays(days, cfg); }

const settingsSchema = z.object({
  maxDays: z.number().int().min(PROTECTION_MIN).max(PROTECTION_CEILING).optional(),
  defaultDays: z.number().int().min(PROTECTION_MIN).max(PROTECTION_CEILING).optional(),
}).strict();

export function createProtectionRouter() {
  const r = Router();
  r.get('/config', requireAuth, (_req: Request, res: Response) => {
    const s: any = db.getState().settings;
    res.json({ success: true, ...currentProtection(), changedBy: s.bypassMaxChangedBy ? true : false, changedAt: s.bypassMaxChangedAt || null });
  });

  r.put('/settings', needs('admin:control_center'), (req: Request, res: Response) => {
    const me = ctx().user;
    const p = settingsSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid days', code: 'PROTECTION_SETTINGS' });
    const s: any = db.getState().settings;
    const before = currentProtection();
    const max = p.data.maxDays ?? before.max;
    let def = p.data.defaultDays ?? before.defaultDays;
    if (p.data.defaultDays !== undefined && p.data.defaultDays > max) {
      return res.status(400).json({ error: `The default (${p.data.defaultDays} days) cannot be above the maximum (${max} days).`, hi: `डिफ़ॉल्ट (${p.data.defaultDays} दिन) अधिकतम (${max} दिन) से ज़्यादा नहीं हो सकता।`, code: 'PROTECTION_DEFAULT_OVER_MAX' });
    }
    if (def > max) def = max; // lowering the maximum pulls the default down with it
    const changes: string[] = [];
    if (max !== before.max) changes.push(`maximum ${before.max} → ${max} days`);
    if (def !== before.defaultDays) changes.push(`default ${before.defaultDays} → ${def} days`);
    s.bypassMaxDays = max;
    s.defaultProtectionPeriodDays = def;
    if (changes.length) {
      s.bypassMaxChangedBy = me.id; s.bypassMaxChangedAt = new Date().toISOString();
      db.appendAuditEvent(me.id, me.role, 'SYSTEM', 'PROTECTION-DAYS', 'PROTECTION_LIMIT_CHANGED', `Bypass protection: ${changes.join('; ')}. Existing bonds keep their days.`);
    }
    db.save();
    res.json({ success: true, ...currentProtection() });
  });
  return r;
}
