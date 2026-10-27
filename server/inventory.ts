/**
 * Live inventory matrix, unit hold, escalator commission slabs and the associates' leaderboard.
 *
 * Rules
 *  1. A unit is AVAILABLE, HOLD (a broker paid a token for his own lead), BOOKED, or RESERVED (builder keeps it).
 *  2. Only the builder who owns the project creates units / changes status. Brokers see the grid only for projects
 *     where they hold an active mandate.
 *  3. A hold needs: own lead on that project, a token ≥ the project minimum, and a payment reference. GENZ does not
 *     move the money — the broker records the receipt / UTR the builder gave. The hold lapses automatically
 *     (default 2 hours); while a booking request is pending the hold stays until the builder decides.
 *  4. Another broker can never see who holds a unit, only that it is on hold.
 *  5. Bookings against a unit label that exists in the grid must respect the grid (see `checkBookingUnit`).
 *  6. (v16.8) A unit carries property facts (road sides, facing, features), the builder can change rates in bulk (with a
 *     preview and a history), and decides who sees a unit / its price. A partner never sees — or can hold / book — a unit the
 *     builder did not open to him. Rules for who sees what live in `invaccess.ts`.
 */
import { tier1Gate } from './tiers.js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import type { BuilderProject, InventoryUnit, UserProfile } from './db.js';
import { ctx, needs } from './auth.js';
import { isAdmin } from './access.js';
import { validateSlabs, slabProgress, leaderPoints, type CpSlab } from '../src/shared/slabs.js';
import { actorFor, unitsFor, seenBy, shapeUnit, type Actor } from './invaccess.js';
import {
  cleanUnitDetail, cleanVis, effectiveVis, partnerMaySee, validateRule, parseFeature, parseFacing, previewRateChange, PRICE_HISTORY_KEEP, PRICE_MAX, DEFAULT_VIS, MAX_FEATURES, type UnitVis,
  UNIT_KIND_IDS, unitKindOf, isFloorWise, parseUnitKind, cleanCode, codeClash, nextCodes, kindLabel,
} from '../src/shared/inventoryRules.js';

export const MAX_UNITS_PER_PROJECT = 1000;
export const DEFAULT_HOLD_HOURS = 2;
export const DEFAULT_MIN_TOKEN = 21000;
const MAX_ACTIVE_HOLDS_PER_BROKER = 3;
const nowIso = () => new Date().toISOString();

/** Lapse expired holds. Cheap; called on every inventory read and before every booking request. */
export function sweepHolds(now = Date.now()): number {
  let n = 0;
  for (const u of db.getState().inventoryUnits) {
    if (u.status === 'HOLD' && u.hold && u.hold.expiresAt && Date.parse(u.hold.expiresAt) <= now) {
      u.status = 'AVAILABLE'; u.hold = undefined; u.updatedAt = nowIso(); n++;
    }
  }
  if (n) db.save();
  return n;
}

const norm = (s: string) => s.trim().toLowerCase();
/** a unit is found by its number (label) — and, failing that, by its inventory code, so a booking that names the code still meets the grid */
export const findUnit = (projectId: string, label: string) => {
  const all = db.getState().inventoryUnits.filter(u => u.projectId === projectId);
  return all.find(u => norm(u.label) === norm(label)) || (label.trim() ? all.find(u => !!u.code && norm(u.code) === norm(label)) : undefined);
};

/** Called by the CRM before a booking request is accepted. */
export function checkBookingUnit(project: BuilderProject, unitNo: string, brokerId: string): { ok: true; unit?: InventoryUnit } | { ok: false; error: string } {
  sweepHolds();
  const unit = findUnit(project.id, unitNo);
  if (!unit) return { ok: true }; // project has no grid entry for this label → legacy free-text unit
  // a partner can only book what the builder opened to him (the builder's own desk is not a partner)
  const asBroker = db.getState().users.find(x => x.id === brokerId && x.role === 'BROKER');
  if (asBroker && !partnerMaySee(effectiveVis(unit.vis, project.invVis), brokerId)) return { ok: false, error: `Unit ${unit.label} is not open to you` };
  if (unit.status === 'BOOKED') return { ok: false, error: `Unit ${unit.label} is already booked` };
  if (unit.status === 'RESERVED') return { ok: false, error: `Unit ${unit.label} is reserved by the builder` };
  if (unit.status === 'HOLD' && unit.hold?.brokerId !== brokerId) return { ok: false, error: `Unit ${unit.label} is on hold for another associate` };
  return { ok: true, unit };
}
export function unitBookingRequested(unit: InventoryUnit | undefined, bookingId: string) {
  if (!unit) return;
  if (unit.status === 'HOLD' && unit.hold) { unit.hold.expiresAt = null; unit.hold.bookingId = bookingId; }
  else { unit.status = 'HOLD'; unit.hold = { brokerId: '', brokerName: '', leadId: '', customerName: '', tokenAmount: 0, tokenRef: '', at: nowIso(), expiresAt: null, bookingId }; }
  unit.updatedAt = nowIso();
}
export function unitBookingDecided(projectId: string, unitNo: string, bookingId: string, outcome: 'APPROVED' | 'RELEASED') {
  const unit = findUnit(projectId, unitNo);
  if (!unit) return;
  if (outcome === 'APPROVED') { unit.status = 'BOOKED'; unit.bookingId = bookingId; unit.hold = undefined; }
  else if (unit.hold?.bookingId === bookingId || unit.bookingId === bookingId) { unit.status = 'AVAILABLE'; unit.hold = undefined; unit.bookingId = undefined; }
  unit.updatedAt = nowIso();
}

const generateSchema = z.object({
  /** the old way to say it: TOWER = floor-wise flats, PLOTS = serial plots. Still accepted; `unitKind` says it better. */
  kind: z.enum(['TOWER', 'PLOTS']).optional(),
  /** v77 — what is being made: flat, penthouse, duplex, villa / independent house, plot, shop, office, other */
  unitKind: z.enum(UNIT_KIND_IDS).optional(),
  group: z.string().trim().min(1).max(30),
  prefix: z.string().trim().max(8).default(''),
  /** first floor number of a floor-wise set (a penthouse block may start at 15; shops at 0 = ground) */
  startFloor: z.number().int().min(0).max(200).default(1),
  floors: z.number().int().min(1).max(60).default(1),
  perFloor: z.number().int().min(1).max(40),
  config: z.string().trim().max(60).default(''),
  areaSqft: z.number().positive().max(1_000_000).optional(),
  basePrice: z.number().positive().max(100_000_000_000).optional(),
  /** v77 — or the rate per sq ft: every unit's price = rate × area */
  ratePerSqft: z.number().positive().max(1_000_000).optional(),
  floorRise: z.number().min(0).max(100_000_000).default(0),
  /** v77 — GR → GR-0001, GR-0002… */
  codePrefix: z.string().trim().max(10).regex(/^[A-Za-z0-9]*$/, 'A code prefix can have letters and digits only').optional(),
});

const patchSchema = z.object({
  kind: z.enum(UNIT_KIND_IDS).optional(),
  status: z.enum(['AVAILABLE', 'RESERVED']).optional(),
  price: z.number().positive().max(PRICE_MAX).optional(),
  config: z.string().trim().max(60).optional(),
  areaSqft: z.number().positive().max(1_000_000).optional(),
  reason: z.string().trim().max(120).optional(),
});

const settingsSchema = z.object({
  holdHours: z.number().int().min(1).max(72).optional(),
  minToken: z.number().int().min(1000).max(10_000_000).optional(),
  cpSlabs: z.array(z.object({
    from: z.number().int().min(1), to: z.number().int().min(1).nullable().optional(),
    commissionPct: z.number(), reward: z.string().trim().max(80).optional(),
  })).max(8).optional(),
});

const holdSchema = z.object({
  leadId: z.string().min(1),
  tokenAmount: z.number().positive().max(100_000_000),
  tokenRef: z.string().trim().min(4, 'Enter the receipt / UTR number the builder gave').max(40),
});

/** Copy cleaned property facts onto a unit; `null` removes a field. */
export function applyDetail<T extends Partial<InventoryUnit>>(unit: T, detail: Record<string, unknown>): T {
  for (const [k, v] of Object.entries(detail)) {
    if (v === null) delete (unit as any)[k];
    else (unit as any)[k] = v;
  }
  return unit;
}

const importRowSchema = z.object({
  group: z.string().trim().min(1).max(30),
  label: z.string().trim().min(1).max(20),
  kind: z.enum(UNIT_KIND_IDS).optional(),
  config: z.string().trim().max(60).default(''),
  areaSqft: z.number().positive().max(1_000_000).optional(),
  price: z.number().positive().max(PRICE_MAX),
  floor: z.number().int().min(0).max(200).optional(),
});

export function createInventoryRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const audit = (entity: 'LEAD' | 'COMMISSION' | 'SYSTEM', id: string, action: string, details: string) => {
    const u = me(); db.appendAuditEvent(u.id, u.role, entity, id, action, details);
  };

  /** project the caller may open: admins all; builder own; partner only with an active mandate; employee per his policy */
  const access = (u: UserProfile, id: string) => actorFor(u, id);
  const ownerAccess = (u: UserProfile, id: string) => {
    const a = actorFor(u, id);
    return a && a.actor.kind === 'OWNER' ? a.project : undefined;
  };

  r.use(needs('inventory:read'));

  const summarize = (units: { status: string }[]) => {
    const count = (s: string) => units.filter(x => x.status === s).length;
    return { total: units.length, available: count('AVAILABLE'), hold: count('HOLD'), booked: count('BOOKED'), reserved: count('RESERVED') };
  };

  /** Projects the caller can open the grid for. */
  r.get('/projects', (_req, res) => {
    sweepHolds();
    const u = me(); const st = db.getState();
    const list: any[] = [];
    for (const p of st.builderProjects) {
      const a = access(u, p.id); if (!a) continue;
      const units = unitsFor(p, a.actor);
      if (a.actor.kind === 'MEMBER' && units.length === 0) continue; // an employee is shown only projects that have something for him
      list.push({ id: p.id, projectName: p.projectName, city: p.city, builderName: p.builderName, units: units.length, available: units.filter(x => x.status === 'AVAILABLE').length });
    }
    res.json({ success: true, projects: list });
  });

  /** how the caller sits in front of this grid — the UI shows only what the server will allow */
  const capsOf = (actor: Actor) => ({
    kind: actor.kind,
    canManage: actor.kind === 'OWNER',
    canHold: actor.kind === 'PARTNER',
    canShare: actor.kind === 'OWNER' || actor.kind === 'PARTNER' || (actor.kind === 'MEMBER' && actor.policy.invShareOut),
    canPost: actor.kind === 'OWNER' || actor.kind === 'PARTNER',
    seesPrice: actor.kind !== 'MEMBER' || actor.policy.invPrice,
    member: actor.kind === 'MEMBER' ? { mode: actor.policy.invMode, price: actor.policy.invPrice, features: actor.policy.invFeatures, shareOut: actor.policy.invShareOut } : undefined,
  });

  r.get('/projects/:id', (req: Request, res: Response) => {
    sweepHolds();
    const u = me();
    const a = access(u, req.params.id);
    if (!a) return res.status(404).json({ error: 'Project not found' });
    const { project: p, actor } = a;
    const units = unitsFor(p, actor);
    const owner = actor.kind === 'ADMIN' || actor.kind === 'OWNER';
    res.json({
      success: true,
      project: {
        id: p.id, projectName: p.projectName, city: p.city, holdHours: p.holdHours ?? DEFAULT_HOLD_HOURS, minToken: p.minToken ?? DEFAULT_MIN_TOKEN,
        cpSlabs: actor.kind === 'MEMBER' ? [] : (p.cpSlabs || []), defaultCommissionPct: owner ? p.channelPartnerCommissionPct : undefined,
        vis: owner ? (p.invVis || DEFAULT_VIS) : undefined,
      },
      units, summary: summarize(units),
      canManage: actor.kind === 'OWNER',
      caps: capsOf(actor),
    });
  });

  // ── builder: build the grid ──
  r.post('/projects/:id/units/generate', needs('inventory:manage'), (req: Request, res: Response) => {
    const u = me(); const p = ownerAccess(u, req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid layout' });
    const detail = cleanUnitDetail(req.body || {});
    if (typeof detail === 'string') return res.status(400).json({ error: detail });
    const d = parsed.data; const st = db.getState();
    const unitKind = d.unitKind ?? (d.kind === 'PLOTS' ? 'PLOT' : d.kind === 'TOWER' ? 'FLAT' : undefined);
    if (!unitKind) return res.status(400).json({ error: 'Pick what you are creating (flat, plot, villa…)' });
    // floor-wise kinds (flat, penthouse, duplex, shop, office) are numbered A-101; the rest serially P-12
    const byFloor = isFloorWise(unitKind);
    const unitPrice = (f: number) => {
      const base = d.basePrice ?? (d.ratePerSqft && d.areaSqft ? d.ratePerSqft * d.areaSqft : 0);
      return Math.round(base + (f - d.startFloor) * d.floorRise);
    };
    if (!d.basePrice && !(d.ratePerSqft && d.areaSqft)) return res.status(400).json({ error: 'Give the base price — or the rate per sq ft together with the area' });
    if (unitPrice(d.startFloor) < 1) return res.status(400).json({ error: 'The price must be above zero' });
    const existing = st.inventoryUnits.filter(x => x.projectId === p.id);
    const floors = byFloor ? d.floors : 1;
    if (existing.length + floors * d.perFloor > MAX_UNITS_PER_PROJECT) return res.status(409).json({ error: `A project can have at most ${MAX_UNITS_PER_PROJECT} units` });
    const codes = d.codePrefix ? nextCodes(existing.map(x => x.code), d.codePrefix, floors * d.perFloor) : [];
    const made: InventoryUnit[] = [];
    for (let i = 0; i < floors; i++) for (let n = 1; n <= d.perFloor; n++) {
      const f = d.startFloor + i;
      const label = byFloor ? `${d.prefix}${f}${String(n).padStart(2, '0')}` : `${d.prefix}${n}`;
      if (existing.some(x => norm(x.label) === norm(label) && norm(x.group) === norm(d.group)) || made.some(x => norm(x.label) === norm(label))) {
        return res.status(409).json({ error: `Unit ${label} already exists in ${d.group}` });
      }
      made.push({
        id: `UNIT-${p.id}-${d.group.replace(/\W+/g, '').slice(0, 6)}-${label}`.replace(/\s+/g, ''),
        projectId: p.id, builderId: p.builderId, group: d.group, label, kind: unitKind, ...(codes.length ? { code: codes[made.length] } : {}), floor: byFloor ? f : undefined,
        config: d.config, areaSqft: d.areaSqft, price: unitPrice(f), status: 'AVAILABLE', updatedAt: nowIso(),
        ...applyDetail({}, detail),
      });
    }
    // a label must be unique across the whole project, because bookings refer to it by label
    const clash = made.find(m => existing.some(x => norm(x.label) === norm(m.label)));
    if (clash) return res.status(409).json({ error: `Unit label ${clash.label} already exists in this project (labels must be unique across groups — use a prefix)` });
    st.inventoryUnits.push(...made);
    p.availableUnits = Math.max(p.availableUnits, 0);
    db.save();
    audit('SYSTEM', p.id, 'INVENTORY_GENERATED', `${u.name} added ${made.length} ${kindLabel(unitKind, false).toLowerCase()} unit(s) to ${p.projectName} (${d.group})`);
    res.json({ success: true, added: made.length });
  });

  r.put('/units/:uid', needs('inventory:manage'), (req: Request, res: Response) => {
    const u = me(); const unit = db.byId('inventoryUnits', req.params.uid);
    if (!unit || unit.builderId !== u.id) return res.status(404).json({ error: 'Unit not found' });
    const p = patchSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid change' });
    const detail = cleanUnitDetail(req.body || {});
    if (typeof detail === 'string') return res.status(400).json({ error: detail });
    const project = db.byId('builderProjects', unit.projectId)!;
    // v77 — the builder's own code for this unit (unique in the project) and what kind of unit it is
    let code: string | null | undefined;
    if (req.body?.code !== undefined) {
      const c = cleanCode(req.body.code);
      if (c !== null && typeof c === 'object') return res.status(400).json({ error: c.error });
      if (c !== null && codeClash(db.getState().inventoryUnits.filter(x => x.projectId === unit.projectId), c, unit.id)) return res.status(409).json({ error: `Code ${c} is already used by another unit of this project` });
      code = c;
    }
    let vis: UnitVis | null | undefined;
    if (req.body?.vis !== undefined) {
      if (req.body.vis === null) vis = null; // back to the project default
      else { const v = cleanVis(req.body.vis, effectiveVis(unit.vis, project.invVis)); if (typeof v === 'string') return res.status(400).json({ error: v }); vis = v; }
    }
    sweepHolds();
    if (p.data.status) {
      if (unit.status === 'BOOKED') return res.status(409).json({ error: 'A booked unit changes only through its booking (cancel it in the CRM)' });
      if (unit.status === 'HOLD') return res.status(409).json({ error: 'Release the hold first' });
      unit.status = p.data.status;
    }
    if (p.data.price !== undefined && p.data.price !== unit.price) {
      if (unit.status === 'BOOKED' || unit.status === 'HOLD') return res.status(409).json({ error: 'The rate of a held or booked unit is locked' });
      const at = nowIso();
      unit.priceHistory = [{ price: p.data.price, at, by: u.name, reason: p.data.reason || undefined }, ...(unit.priceHistory || [])].slice(0, PRICE_HISTORY_KEEP);
      audit('SYSTEM', unit.id, 'INVENTORY_RATE_CHANGED', `${u.name} changed the rate of ${unit.label} (${project.projectName}) from ₹${unit.price.toLocaleString('en-IN')} to ₹${p.data.price.toLocaleString('en-IN')}${p.data.reason ? ` — ${p.data.reason}` : ''}`);
      unit.price = p.data.price;
    }
    if (p.data.config !== undefined) unit.config = p.data.config;
    if (p.data.areaSqft !== undefined) unit.areaSqft = p.data.areaSqft;
    if (p.data.kind !== undefined) unit.kind = p.data.kind;
    if (code !== undefined) { if (code === null) delete unit.code; else unit.code = code; }
    applyDetail(unit, detail);
    if (vis !== undefined) { if (vis === null) delete unit.vis; else unit.vis = vis; }
    unit.updatedAt = nowIso(); db.save();
    audit('SYSTEM', unit.id, 'INVENTORY_UNIT_UPDATED', `${u.name} updated unit ${unit.label} (${unit.status})${vis !== undefined ? ' — visibility changed' : ''}`);
    res.json({ success: true });
  });

  /** One action on many units — rate change (with preview), visibility, property facts, status. */
  r.post('/projects/:id/units/bulk', needs('inventory:manage'), (req: Request, res: Response) => {
    const u = me(); const p = ownerAccess(u, req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    sweepHolds();
    const st = db.getState();
    const b = req.body || {};
    let picked: InventoryUnit[];
    if (Array.isArray(b.unitIds)) {
      if (b.unitIds.length === 0 || b.unitIds.length > MAX_UNITS_PER_PROJECT) return res.status(400).json({ error: 'Pick between 1 and 1000 units' });
      const ids = new Set(b.unitIds.map(String));
      picked = st.inventoryUnits.filter(x => x.projectId === p.id && ids.has(x.id));
      if (picked.length !== ids.size) return res.status(400).json({ error: 'Some units are not part of this project' });
    } else if (b.filter && typeof b.filter === 'object') {
      const f = b.filter;
      picked = st.inventoryUnits.filter(x => x.projectId === p.id && (!f.group || x.group === f.group) && (!f.status || x.status === f.status) && (!f.config || x.config === f.config) && (!f.kind || unitKindOf(x) === f.kind));
      if (picked.length === 0) return res.status(400).json({ error: 'No unit matches this selection' });
    } else return res.status(400).json({ error: 'Pick the units first' });

    const action = b.action;
    const reason = String(b.reason || '').trim().slice(0, 120);
    const at = nowIso();
    if (action === 'RATE') {
      const rule = validateRule(b.rule);
      if (typeof rule === 'string') return res.status(400).json({ error: rule });
      const prev = previewRateChange(picked, rule);
      if (b.dryRun) return res.json({ success: true, dryRun: true, ...prev, total: picked.length });
      if (prev.changes.length === 0) return res.status(409).json({ error: 'No unit would change (held / booked units are locked)' });
      const byId = new Map(picked.map(x => [x.id, x]));
      for (const c of prev.changes) {
        const unit = byId.get(c.id)!;
        unit.priceHistory = [{ price: c.to, at, by: u.name, reason: reason || undefined }, ...(unit.priceHistory || [])].slice(0, PRICE_HISTORY_KEEP);
        unit.price = c.to; unit.updatedAt = at;
      }
      if (b.notify === true) {
        st.projectUpdates.unshift({
          id: `UPD-${Date.now().toString(36)}`, projectId: p.id, builderId: p.builderId, kind: 'PRICE', title: 'Rates revised',
          body: `Rates were revised on ${prev.changes.length} unit${prev.changes.length === 1 ? '' : 's'}${reason ? ` — ${reason}` : ''}. Check the unit grid for the new rates.`,
          audience: 'ASSOCIATES', createdBy: u.id, createdAt: at,
        });
      }
      db.save();
      audit('SYSTEM', p.id, 'INVENTORY_RATE_CHANGED', `${u.name} revised rates on ${prev.changes.length} unit(s) of ${p.projectName} (${rule.mode} ${rule.value}${rule.mode === 'PCT' ? '%' : ''})${reason ? ` — ${reason}` : ''}; ${prev.skipped.length} skipped`);
      return res.json({ success: true, applied: prev.changes.length, skipped: prev.skipped });
    }
    if (action === 'VISIBILITY') {
      let next: UnitVis | null;
      if (b.vis === null) next = null;
      else { const v = cleanVis(b.vis || {}, p.invVis || DEFAULT_VIS); if (typeof v === 'string') return res.status(400).json({ error: v }); next = v; }
      for (const unit of picked) { if (next === null) delete unit.vis; else unit.vis = { ...next, brokerIds: [...next.brokerIds] }; unit.updatedAt = at; }
      db.save();
      audit('SYSTEM', p.id, 'INVENTORY_VISIBILITY_SET', `${u.name} set who sees ${picked.length} unit(s) of ${p.projectName}: ${next ? `${next.audience}${next.audience === 'SELECTED' ? ` (${next.brokerIds.length} partners)` : ''}${next.priceHidden ? ', price hidden' : ''}` : 'project default'}`);
      return res.json({ success: true, applied: picked.length });
    }
    if (action === 'FEATURES') {
      const detail = cleanUnitDetail(b.detail || {});
      if (typeof detail === 'string') return res.status(400).json({ error: detail });
      delete (detail as any).features; // tags are added / removed below, never replaced wholesale in bulk
      const add: string[] = Array.isArray(b.addFeatures) ? b.addFeatures.map(String) : [];
      const remove = new Set<string>(Array.isArray(b.removeFeatures) ? b.removeFeatures.map(String) : []);
      const chk = cleanUnitDetail({ features: add });
      if (typeof chk === 'string') return res.status(400).json({ error: chk });
      if (Object.keys(detail).length === 0 && add.length === 0 && remove.size === 0) return res.status(400).json({ error: 'Choose what to set' });
      for (const unit of picked) {
        applyDetail(unit, detail);
        const f = new Set([...(unit.features || []), ...add]); for (const x of remove) f.delete(x);
        if (f.size > MAX_FEATURES) return res.status(400).json({ error: `At most ${MAX_FEATURES} features per unit` });
        if (f.size) unit.features = [...f]; else delete unit.features;
        unit.updatedAt = at;
      }
      db.save();
      audit('SYSTEM', p.id, 'INVENTORY_FEATURES_SET', `${u.name} updated property facts on ${picked.length} unit(s) of ${p.projectName}`);
      return res.json({ success: true, applied: picked.length });
    }
    if (action === 'KIND') {
      if (!UNIT_KIND_IDS.includes(b.unitKind)) return res.status(400).json({ error: 'Pick a valid kind of unit' });
      for (const unit of picked) { unit.kind = b.unitKind; unit.updatedAt = at; }
      db.save();
      audit('SYSTEM', p.id, 'INVENTORY_UNIT_UPDATED', `${u.name} set ${picked.length} unit(s) of ${p.projectName} to ${kindLabel(b.unitKind, false)}`);
      return res.json({ success: true, applied: picked.length });
    }
    if (action === 'STATUS') {
      if (!['AVAILABLE', 'RESERVED'].includes(b.status)) return res.status(400).json({ error: 'Status must be AVAILABLE or RESERVED' });
      let n = 0;
      for (const unit of picked) { if (unit.status === 'BOOKED' || unit.status === 'HOLD') continue; unit.status = b.status; unit.updatedAt = at; n++; }
      db.save();
      audit('SYSTEM', p.id, 'INVENTORY_UNIT_UPDATED', `${u.name} set ${n} unit(s) of ${p.projectName} to ${b.status}`);
      return res.json({ success: true, applied: n, skipped: picked.length - n });
    }
    return res.status(400).json({ error: 'Unknown action' });
  });

  /** Project default: who sees the grid and the rates. A unit can still override it. */
  r.put('/projects/:id/visibility', needs('inventory:manage'), (req: Request, res: Response) => {
    const u = me(); const p = ownerAccess(u, req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    const v = cleanVis(req.body || {}, p.invVis || DEFAULT_VIS);
    if (typeof v === 'string') return res.status(400).json({ error: v });
    if (v.audience === 'SELECTED') {
      const allowed = new Set(db.getState().associateMandates.filter(m => m.projectId === p.id).map(m => m.brokerId));
      if (v.brokerIds.some(id => !allowed.has(id))) return res.status(400).json({ error: 'Pick only your own partners of this project' });
    }
    p.invVis = v;
    let cleared = 0;
    if (req.body?.clearOverrides === true) for (const x of db.getState().inventoryUnits) if (x.projectId === p.id && x.vis) { delete x.vis; cleared++; }
    p.updatedAt = nowIso(); db.save();
    audit('SYSTEM', p.id, 'INVENTORY_VISIBILITY_SET', `${u.name} set the default for ${p.projectName}: ${v.audience}${v.audience === 'SELECTED' ? ` (${v.brokerIds.length} partners)` : ''}${v.priceHidden ? ', price hidden' : ''}${cleared ? `; ${cleared} unit override(s) cleared` : ''}`);
    res.json({ success: true, vis: v, cleared });
  });

  /** The builder's partners on a project — for the "only these partners" picker. Names only. */
  r.get('/projects/:id/partners', needs('inventory:manage'), (req: Request, res: Response) => {
    const u = me(); const p = ownerAccess(u, req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    const rows = db.getState().associateMandates.filter(m => m.projectId === p.id && ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED'].includes(m.status))
      .map(m => ({ brokerId: m.brokerId, name: m.brokerName, company: m.brokerCompany, status: m.status }));
    res.json({ success: true, partners: rows });
  });

  /** Rows pasted from a sheet: create new units, or update rate + facts of units that are still free. */
  r.post('/projects/:id/units/import', needs('inventory:manage'), (req: Request, res: Response) => {
    const u = me(); const p = ownerAccess(u, req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0 || rows.length > 500) return res.status(400).json({ error: 'Send between 1 and 500 rows' });
    sweepHolds();
    const st = db.getState(); const at = nowIso();
    const existing = st.inventoryUnits.filter(x => x.projectId === p.id);
    const errors: { row: number; error: string }[] = [];
    const plan: { row: any; detail: Record<string, unknown>; unit?: InventoryUnit; features?: string[]; code?: string }[] = [];
    const seen = new Set<string>(); const seenCodes = new Set<string>();
    rows.forEach((raw: any, i: number) => {
      // v77 — "kind" may be written the way people write it (flat, Penthouse, independent house, प्लॉट…) and "code" is the builder's own inventory code
      const kindWord = raw.kind === undefined || String(raw.kind).trim() === '' ? undefined : parseUnitKind(raw.kind);
      if (raw.kind !== undefined && String(raw.kind).trim() !== '' && !kindWord) { errors.push({ row: i + 1, error: `Unknown kind "${String(raw.kind).slice(0, 30)}" — use flat, penthouse, duplex, villa, plot, shop, office or other` }); return; }
      let code: string | undefined;
      if (raw.code !== undefined && String(raw.code).trim() !== '') {
        const c = cleanCode(raw.code);
        if (c !== null && typeof c === 'object') { errors.push({ row: i + 1, error: c.error }); return; }
        code = c as string;
        if (seenCodes.has(norm(code))) { errors.push({ row: i + 1, error: `Code ${code} appears twice in this sheet` }); return; }
        seenCodes.add(norm(code));
      }
      const parsed = importRowSchema.safeParse({
        kind: kindWord,
        group: raw.group, label: String(raw.label ?? ''), config: raw.config ?? '', price: Number(raw.price),
        areaSqft: raw.areaSqft === undefined || raw.areaSqft === '' ? undefined : Number(raw.areaSqft),
        floor: raw.floor === undefined || raw.floor === '' ? undefined : Number(raw.floor),
      });
      if (!parsed.success) { errors.push({ row: i + 1, error: parsed.error.issues[0]?.message || 'Invalid row' }); return; }
      const toks: string[] = typeof raw.features === 'string' ? raw.features.split(/[;,|]/).map((x: string) => x.trim()).filter(Boolean) : Array.isArray(raw.features) ? raw.features.map(String) : [];
      const feats = toks.map(t => parseFeature(t));
      if (feats.some(f => !f)) { errors.push({ row: i + 1, error: `Unknown feature "${toks[feats.findIndex(f => !f)]}"` }); return; }
      const facing = raw.facing ? parseFacing(String(raw.facing)) : undefined;
      if (raw.facing && !facing) { errors.push({ row: i + 1, error: `Unknown facing "${raw.facing}"` }); return; }
      const detail = cleanUnitDetail({ facing, roadSides: raw.roadSides === '' ? undefined : raw.roadSides, roadWidthFt: raw.roadWidthFt === '' ? undefined : raw.roadWidthFt, dimensions: raw.dimensions, features: toks.length ? feats : undefined, note: raw.note });
      if (typeof detail === 'string') { errors.push({ row: i + 1, error: detail }); return; }
      const key = norm(parsed.data.label);
      if (seen.has(key)) { errors.push({ row: i + 1, error: `Label ${parsed.data.label} appears twice in this sheet` }); return; }
      seen.add(key);
      const unit = existing.find(x => norm(x.label) === key);
      if (unit && (unit.status === 'BOOKED' || unit.status === 'HOLD')) { errors.push({ row: i + 1, error: `${unit.label} is ${unit.status.toLowerCase()} — its details are locked` }); return; }
      if (code) {
        const other = codeClash(existing, code, unit?.id);
        if (other) { errors.push({ row: i + 1, error: `Code ${code} already belongs to ${other.label}` }); return; }
      }
      plan.push({ row: parsed.data, detail, unit, code });
    });
    if (errors.length) return res.status(400).json({ error: `${errors.length} row(s) need fixing — nothing was saved`, errors: errors.slice(0, 20) });
    const fresh = plan.filter(x => !x.unit).length;
    if (existing.length + fresh > MAX_UNITS_PER_PROJECT) return res.status(409).json({ error: `A project can have at most ${MAX_UNITS_PER_PROJECT} units` });
    let created = 0, updated = 0;
    for (const x of plan) {
      if (x.unit) {
        if (x.row.price !== x.unit.price) { x.unit.priceHistory = [{ price: x.row.price, at, by: u.name, reason: 'Sheet import' }, ...(x.unit.priceHistory || [])].slice(0, PRICE_HISTORY_KEEP); x.unit.price = x.row.price; }
        x.unit.config = x.row.config || x.unit.config; if (x.row.areaSqft) x.unit.areaSqft = x.row.areaSqft;
        if (x.row.kind) x.unit.kind = x.row.kind; if (x.code) x.unit.code = x.code;
        applyDetail(x.unit, x.detail); x.unit.updatedAt = at; updated++;
      } else {
        const unit: InventoryUnit = {
          id: `UNIT-${p.id}-${x.row.group.replace(/\W+/g, '').slice(0, 6)}-${x.row.label}`.replace(/\s+/g, ''),
          projectId: p.id, builderId: p.builderId, group: x.row.group, label: x.row.label, kind: x.row.kind ?? unitKindOf({ floor: x.row.floor }), ...(x.code ? { code: x.code } : {}),
          floor: x.row.floor, config: x.row.config, areaSqft: x.row.areaSqft,
          price: x.row.price, status: 'AVAILABLE', updatedAt: at,
        };
        applyDetail(unit, x.detail); st.inventoryUnits.push(unit); created++;
      }
    }
    db.save();
    audit('SYSTEM', p.id, 'INVENTORY_IMPORTED', `${u.name} imported a sheet into ${p.projectName}: ${created} added, ${updated} updated`);
    res.json({ success: true, created, updated });
  });

  /** hold window, minimum token and escalator slabs */
  r.put('/projects/:id/settings', needs('inventory:manage'), (req: Request, res: Response) => {
    const u = me(); const p = ownerAccess(u, req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    const s = settingsSchema.safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: s.error.issues[0]?.message || 'Invalid settings' });
    if (s.data.cpSlabs) {
      const slabs = s.data.cpSlabs.map(x => ({ from: x.from, to: x.to ?? null, commissionPct: x.commissionPct, reward: x.reward || undefined })) as CpSlab[];
      const err = validateSlabs(slabs);
      if (err) return res.status(400).json({ error: err });
      p.cpSlabs = slabs;
    }
    if (s.data.holdHours !== undefined) p.holdHours = s.data.holdHours;
    if (s.data.minToken !== undefined) p.minToken = s.data.minToken;
    p.updatedAt = nowIso(); db.save();
    audit('COMMISSION', p.id, 'CP_SLABS_UPDATED', `${u.name} updated hold window / token / escalator slabs on ${p.projectName} (${(p.cpSlabs || []).length} slabs). Applies to bookings approved from now on.`);
    res.json({ success: true });
  });

  // ── broker: hold a unit for a lead ──
  r.post('/units/:uid/hold', needs('inventory:hold'), tier1Gate, (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    sweepHolds();
    const unit = db.byId('inventoryUnits', req.params.uid);
    const a = unit && access(u, unit.projectId);
    const p = a && a.actor.kind === 'PARTNER' && seenBy(a.actor, a.project, unit!).visible ? a.project : undefined;
    if (!unit || !p) return res.status(404).json({ error: 'Unit not found' });
    const parsed = holdSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid hold request' });
    const d = parsed.data;
    const lead = db.byId('crmLeads', d.leadId);
    if (!lead || lead.associateId !== u.id || lead.projectId !== p.id) return res.status(400).json({ error: 'Pick your own registered lead on this project' });
    const minToken = p.minToken ?? DEFAULT_MIN_TOKEN;
    if (d.tokenAmount < minToken) return res.status(400).json({ error: `Minimum token to hold a unit is ₹${minToken.toLocaleString('en-IN')}` });
    if (unit.status !== 'AVAILABLE') return res.status(409).json({ error: unit.status === 'HOLD' ? 'This unit was just put on hold by someone else' : `Unit is ${unit.status.toLowerCase()}` });
    const mine = st.inventoryUnits.filter(x => x.status === 'HOLD' && x.hold?.brokerId === u.id);
    if (mine.length >= MAX_ACTIVE_HOLDS_PER_BROKER) return res.status(409).json({ error: `You can keep ${MAX_ACTIVE_HOLDS_PER_BROKER} units on hold at a time` });
    if (mine.some(x => x.hold?.leadId === lead.id)) return res.status(409).json({ error: 'This customer already has a unit on hold' });
    const hours = p.holdHours ?? DEFAULT_HOLD_HOURS;
    const at = nowIso();
    unit.status = 'HOLD';
    unit.hold = { brokerId: u.id, brokerName: u.name, leadId: lead.id, customerName: lead.name, tokenAmount: d.tokenAmount, tokenRef: d.tokenRef, at, expiresAt: new Date(Date.now() + hours * 3600_000).toISOString() };
    unit.updatedAt = at;
    lead.activities.unshift({ id: `A-${Date.now().toString(36)}`, type: 'SYSTEM', note: `Unit ${unit.label} put on hold for ${hours}h (token ₹${d.tokenAmount.toLocaleString('en-IN')}, ref ${d.tokenRef})`, byUserId: u.id, byName: u.name, at });
    lead.updatedAt = at;
    db.save();
    audit('LEAD', lead.id, 'UNIT_HOLD_PLACED', `${u.name} held unit ${unit.label} of ${p.projectName} for ${lead.name} for ${hours}h; token ₹${d.tokenAmount.toLocaleString('en-IN')} ref ${d.tokenRef}`);
    res.json({ success: true, unit: shapeUnit(unit, p, a!.actor, seenBy(a!.actor, p, unit)) });
  });

  r.post('/units/:uid/release', (req: Request, res: Response) => {
    const u = me(); const unit = db.byId('inventoryUnits', req.params.uid);
    if (!unit || unit.status !== 'HOLD' || !unit.hold) return res.status(404).json({ error: 'No active hold on this unit' });
    const allowed = isAdmin(u) || unit.builderId === u.id || unit.hold.brokerId === u.id;
    if (!allowed) return res.status(404).json({ error: 'No active hold on this unit' });
    if (unit.hold.bookingId) return res.status(409).json({ error: 'A booking request is pending on this unit — it is decided in the CRM' });
    const prev = unit.hold;
    unit.status = 'AVAILABLE'; unit.hold = undefined; unit.updatedAt = nowIso();
    db.save();
    audit('LEAD', prev.leadId, 'UNIT_HOLD_RELEASED', `${u.name} released the hold on unit ${unit.label} (token ${prev.tokenRef} is to be settled between ${prev.brokerName} and the builder)`);
    res.json({ success: true });
  });

  /** Associates ranked on counted (approved) bookings. Values are shown only to the builder and to the associate himself. */
  r.get('/projects/:id/leaderboard', (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const a = access(u, req.params.id);
    if (!a || a.actor.kind === 'MEMBER') return res.status(404).json({ error: 'Project not found' }); // staff do not see partner rankings
    const p = a.project;
    const owner = isAdmin(u) || u.id === p.builderId;
    const rows = st.associateMandates.filter(m => m.projectId === p.id && ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'COMPLETED'].includes(m.status)).map(m => {
      const bs = st.crmBookings.filter(b => b.mandateId === m.id && b.status === 'APPROVED');
      const units = bs.length; const value = bs.reduce((a, b) => a + b.agreementValue, 0);
      const prog = slabProgress(p.cpSlabs, units);
      return {
        brokerId: m.brokerId, name: m.brokerName, units, points: leaderPoints(units, value),
        value: owner || m.brokerId === u.id ? value : undefined,
        slabPct: prog.current?.commissionPct, reward: prog.current?.reward,
        next: prog.next ? { atBooking: prog.next.from, commissionPct: prog.next.commissionPct, reward: prog.next.reward, toGo: prog.toNext } : undefined,
        you: m.brokerId === u.id,
      };
    }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).map((x, i) => ({ rank: i + 1, ...x }));
    res.json({ success: true, rows, slabs: p.cpSlabs || [] });
  });

  return r;
}
