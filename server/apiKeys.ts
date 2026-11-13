/**
 * v135 — API keys the superadmin types in the Control Center. Stored sealed (vault, AES-GCM) in the database, so every
 * server copy picks a change up on its next request. A key not set here falls back to the server env (Vercel).
 * The full value of a secret never goes back to a browser — only its last 4 characters.
 */
import { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import { ctx, needs } from './auth.js';
import { seal, unseal, vaultReady } from './vaultCrypto.js';

type Spec = { name: string; group: string; label: string; secret: boolean; re?: RegExp; hint?: string };
export const API_KEYS: Spec[] = [
  { name: 'FAST2SMS_API_KEY', group: 'SMS — Fast2SMS', label: 'API key (Dev API)', secret: true },
  { name: 'FAST2SMS_OTP_ID', group: 'SMS — Fast2SMS', label: 'OTP template id (Smart OTP)', secret: false, re: /^[A-Za-z0-9_-]{1,40}$/ },
  { name: 'SMS_WEBHOOK_URL', group: 'SMS — other gateway', label: 'Gateway URL', secret: false, re: /^https:\/\/[^\s]+$/, hint: 'https:// only' },
  { name: 'SMS_WEBHOOK_TOKEN', group: 'SMS — other gateway', label: 'Gateway token', secret: true },
  { name: 'FIREBASE_API_KEY', group: 'Firebase phone OTP', label: 'Web API key', secret: true },
  { name: 'FIREBASE_PROJECT_ID', group: 'Firebase phone OTP', label: 'Project id', secret: false, re: /^[a-z0-9-]{4,40}$/ },
  { name: 'FIREBASE_APP_ID', group: 'Firebase phone OTP', label: 'App id (optional)', secret: false, re: /^[A-Za-z0-9:._-]{1,80}$/ },
  { name: 'FIREBASE_AUTH_DOMAIN', group: 'Firebase phone OTP', label: 'Auth domain (optional)', secret: false, re: /^[a-z0-9.-]{4,100}$/ },
  { name: 'TURN_URLS', group: 'Calls — TURN relay', label: 'TURN URLs (comma separated)', secret: false, re: /^turns?:[^\s,]+(,\s*turns?:[^\s,]+)*$/i, hint: 'turn: or turns:' },
  { name: 'TURN_USERNAME', group: 'Calls — TURN relay', label: 'Username', secret: false },
  { name: 'TURN_CREDENTIAL', group: 'Calls — TURN relay', label: 'Password / credential', secret: true },
];
const SPEC = new Map(API_KEYS.map(k => [k.name, k]));

type Row = { v: string; at: string; by: string };
const rows = () => ((db.getState() as any).apiKeys || {}) as Record<string, Row>;
const aad = (name: string) => `apikey|${name}`;
const plain = new Map<string, string>();   // sealed → value, so a hot path does not decrypt on every call

/** The key's value: the one typed in the Control Center, else the server env, else ''. */
export function apiKey(name: string): string {
  const row = rows()[name];
  if (row?.v) {
    let v = plain.get(row.v);
    if (v === undefined) { try { v = unseal(row.v, aad(name)); } catch { console.error(`[API-KEYS] ${name}: stored value could not be opened (vault key changed?) — using the server env`); v = ''; } plain.set(row.v, v); }
    if (v) return v;
  }
  return (process.env[name] || '').trim();
}

const tail = (v: string) => (v.length > 8 ? `••••${v.slice(-4)}` : '••••');

export function createApiKeysRouter() {
  const r = Router();
  r.use(needs('admin:control_center'), (_req, res, next) => (ctx().user?.role === 'SUPERADMIN' ? next() : res.status(403).json({ error: 'Superadmin only' })));

  r.get('/', (_req: Request, res: Response) => {
    const all = rows();
    res.json({
      success: true, vault: vaultReady(),
      keys: API_KEYS.map(k => {
        const row = all[k.name]; const v = apiKey(k.name); const source = row?.v ? 'panel' : v ? 'server' : 'none';
        return { name: k.name, group: k.group, label: k.label, secret: k.secret, hint: k.hint, source, shown: v ? (k.secret ? tail(v) : v) : '', updatedAt: row?.at || null, updatedBy: row ? db.byId('users', row.by)?.name || null : null };
      }),
    });
  });

  r.put('/:name', (req: Request, res: Response) => {
    const k = SPEC.get(req.params.name); if (!k) return res.status(404).json({ error: 'Unknown key' });
    const value = typeof req.body?.value === 'string' ? req.body.value.trim() : null;
    if (value === null) return res.status(400).json({ error: 'value must be text' });
    if (value.length > 500 || /[\u0000-\u001f\u007f]/.test(value)) return res.status(400).json({ error: 'Too long or has hidden characters' });
    if (value && k.re && !k.re.test(value)) return res.status(400).json({ error: `Not a valid ${k.label}${k.hint ? ` (${k.hint})` : ''}` });
    const me = ctx().user!; const s = db.getState() as any; const all = (s.apiKeys ||= {}) as Record<string, Row>;
    if (!value) {
      if (!all[k.name]) return res.json({ success: true });
      delete all[k.name];
      db.appendAuditEvent(me.id, me.role, 'SYSTEM', 'API-KEYS', 'API_KEY_CLEARED', `${k.name} removed from the Control Center (the server setting, if any, applies again).`);
    } else {
      if (!vaultReady()) return res.status(503).json({ error: 'The server vault key is not set, so keys cannot be stored safely. Add it in the server settings first.' });
      all[k.name] = { v: seal(value, aad(k.name)), at: new Date().toISOString(), by: me.id };
      db.appendAuditEvent(me.id, me.role, 'SYSTEM', 'API-KEYS', 'API_KEY_SET', `${k.name} set in the Control Center (${k.secret ? tail(value) : value}).`);
    }
    db.save();
    res.json({ success: true });
  });
  return r;
}
