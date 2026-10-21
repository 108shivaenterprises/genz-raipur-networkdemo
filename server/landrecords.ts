/**
 * Land records & title red-flag scanner.
 *
 * A person reads the official land record (state land-record portal / tehsil office) and types what it says.
 * GENZ stores it, applies the rule-set in `src/shared/redflags.ts` and shows a verdict (CLEAR / CAUTION / DANGER).
 * GENZ never fetches any government site — the red flags are only as good as what was entered.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import type { LandRecord, UserProfile } from './db.js';
import { ctx, needs } from './auth.js';
import { isAdmin } from './access.js';
import { scanRedFlags } from '../src/shared/redflags.js';

const enums = {
  landUse: ['AGRICULTURAL', 'RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'NAZUL', 'OTHER'] as const,
  enc: ['NOT_CHECKED', 'CLEAR', 'MORTGAGE', 'LITIGATION', 'OTHER_CHARGE'] as const,
  noc: ['NOT_REQUIRED', 'PENDING', 'RECEIVED'] as const,
  auth: ['NONE', 'TOWN_COUNTRY_PLANNING', 'GRAM_PANCHAYAT', 'MUNICIPAL', 'DEVELOPMENT_AUTHORITY', 'OTHER'] as const,
};
const txt = (max: number) => z.string().trim().max(max);

const bodySchema = z.object({
  title: txt(120).min(2, 'Give the record a title'),
  state: txt(60).min(2, 'State is required'), district: txt(60).min(2, 'District is required'),
  tehsil: txt(60).default(''), village: txt(80).default(''),
  khasraNo: txt(40).min(1, 'Khasra / survey number is required'),
  areaText: txt(60).default(''),
  propertyId: txt(40).optional(),
  fields: z.object({
    landUse: z.enum(enums.landUse), diverted: z.boolean(), diversionOrderNo: txt(60).optional(),
    ownerNameOnRecord: txt(120).min(2, 'Owner name as on the record is required'), sellerName: txt(120).optional(),
    encumbrance: z.enum(enums.enc), bankNoc: z.enum(enums.noc),
    approvalAuthority: z.enum(enums.auth), approvalNo: txt(60).optional(), reraNo: txt(60).optional(),
    isLayoutOrProject: z.boolean(), sharedOwnership: z.boolean().optional(), coOwnersConsent: z.boolean().optional(),
  }),
  encumbranceNote: txt(500).optional(),
  sourceNote: txt(300).optional(),
  markVerified: z.boolean().optional(),
});

export function createLandRecordsRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  r.use(needs('landrecord:manage'));

  const canSee = (u: UserProfile, rec: LandRecord) => {
    if (isAdmin(u) || u.role === 'LEGAL_COUNSEL' || rec.createdBy === u.id) return true;
    const prop = rec.propertyId && db.byId('properties', rec.propertyId);
    return !!prop && (prop.listingBrokerId === u.id || prop.ownerId === u.id);
  };
  const canEdit = (u: UserProfile, rec: LandRecord) => isAdmin(u) || u.role === 'LEGAL_COUNSEL' || rec.createdBy === u.id;
  const view = (rec: LandRecord) => ({ ...rec, scan: scanRedFlags(rec.fields) });
  const audit = (id: string, action: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', id, action, details); };

  r.get('/', (_req, res) => {
    const u = me();
    res.json({ success: true, records: db.getState().landRecords.filter(x => canSee(u, x)).map(view) });
  });

  /** Properties the caller may link a record to. */
  r.get('/properties', (_req, res) => {
    const u = me();
    const list = db.getState().properties.filter(p => isAdmin(u) || u.role === 'LEGAL_COUNSEL' || p.listingBrokerId === u.id || p.ownerId === u.id)
      .map(p => ({ id: p.id, title: p.title, locality: p.locality, city: p.city }));
    res.json({ success: true, properties: list });
  });

  r.post('/', (req: Request, res: Response) => {
    const u = me();
    const p = bodySchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid record' });
    const d = p.data; const st = db.getState();
    if (d.propertyId) {
      const prop = db.byId('properties', d.propertyId);
      if (!prop || !(isAdmin(u) || u.role === 'LEGAL_COUNSEL' || prop.listingBrokerId === u.id || prop.ownerId === u.id)) return res.status(404).json({ error: 'Property not found' });
    }
    if (st.landRecords.filter(x => x.createdBy === u.id).length >= 500) return res.status(409).json({ error: 'Record limit reached' });
    const now = new Date().toISOString();
    const rec: LandRecord = {
      id: `LR-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`, createdBy: u.id, propertyId: d.propertyId, title: d.title,
      state: d.state, district: d.district, tehsil: d.tehsil, village: d.village, khasraNo: d.khasraNo, areaText: d.areaText,
      fields: { ...d.fields, verifiedAt: d.markVerified ? now : undefined }, encumbranceNote: d.encumbranceNote, sourceNote: d.sourceNote, createdAt: now, updatedAt: now,
    };
    st.landRecords.unshift(rec); db.save();
    const scan = scanRedFlags(rec.fields);
    audit(rec.id, 'LAND_RECORD_CREATED', `${u.name} recorded khasra ${rec.khasraNo}, ${rec.village || rec.tehsil}, ${rec.district} — verdict ${scan.verdict} (${scan.flags.length} flags)`);
    res.json({ success: true, record: view(rec) });
  });

  r.put('/:id', (req: Request, res: Response) => {
    const u = me();
    const rec = db.getState().landRecords.find(x => x.id === req.params.id);
    if (!rec || !canSee(u, rec)) return res.status(404).json({ error: 'Record not found' });
    if (!canEdit(u, rec)) return res.status(403).json({ error: 'Only the person who created this record (or legal counsel / admin) can edit it' });
    const p = bodySchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid record' });
    const d = p.data; const now = new Date().toISOString();
    Object.assign(rec, { title: d.title, state: d.state, district: d.district, tehsil: d.tehsil, village: d.village, khasraNo: d.khasraNo, areaText: d.areaText, encumbranceNote: d.encumbranceNote, sourceNote: d.sourceNote, updatedAt: now });
    rec.fields = { ...d.fields, verifiedAt: d.markVerified ? now : rec.fields.verifiedAt };
    db.save();
    audit(rec.id, 'LAND_RECORD_UPDATED', `${u.name} updated land record ${rec.id}; verdict ${scanRedFlags(rec.fields).verdict}`);
    res.json({ success: true, record: view(rec) });
  });

  r.delete('/:id', (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const i = st.landRecords.findIndex(x => x.id === req.params.id);
    if (i < 0 || !canSee(u, st.landRecords[i])) return res.status(404).json({ error: 'Record not found' });
    if (!canEdit(u, st.landRecords[i])) return res.status(403).json({ error: 'Not allowed' });
    const [gone] = st.landRecords.splice(i, 1); db.save();
    audit(gone.id, 'LAND_RECORD_DELETED', `${u.name} deleted land record ${gone.id}`);
    res.json({ success: true });
  });

  return r;
}
