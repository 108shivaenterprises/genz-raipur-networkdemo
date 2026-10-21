/**
 * v17 — Network Pulse.  Mounted at /api/admin/pulse (superadmin only).
 *
 * Answers, in one place: how many people / brokers came today, this week, this month; how many bookings the network made and what they
 * are worth; how much of that money has actually been collected; how many projects are live.  It only READS the platform's own records —
 * it moves no money and shows no customer name or phone number.
 *
 * The one new thing it stores is a daily record of WHO was around (user-id + Indian date; no page, no IP, no phone), kept 180 days.
 * For the days before that record existed, the audit trail gives the people who did something.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from './db.js';
import { ctx, needs } from './auth.js';
import { collectedPct } from './crm.js';
import { holderTotals, holderOf, isOpenTrail, trailFlags, type MoneyTrail } from '../src/shared/moneyTrail.js';
import {
  ADMIN_ROLES, WINDOWS, addActivity, pruneActivity, dayKey, dayOfIso, lastDays, windowDays, windowCounts, windowSets, daysActive, activitySeries, auditActivity,
  bookingStats, projectStats, isLiveProject, trackingSince, isWindow, soldDay,
  type ActivityInput, type ActivityKind, type WindowKey,
} from '../src/shared/pulseRules.js';

// ───────────────────────── recording ─────────────────────────
/** ids already written for today, so a busy broker costs one Set lookup per request, not a scan of the day's list */
const mem = new Map<string, Set<string>>();
let lastPrune = '';

export function recordActivity(userId: string, kind: ActivityKind, nowMs = Date.now()): void {
  if (!userId) return;
  const day = dayKey(nowMs);
  const st = db.getState();
  st.activityDays ||= [];
  const hydrate = (k: ActivityKind) => {
    const key = `${day}|${k}`;
    let s = mem.get(key);
    if (!s) {
      for (const old of mem.keys()) if (!old.startsWith(day)) mem.delete(old); // a new day: forget yesterday's cache
      s = new Set(st.activityDays.find(d => d.day === day)?.[k] || []);
      mem.set(key, s);
    }
    return s;
  };
  const seen = hydrate('seen');
  const acted = kind === 'acted' ? hydrate('acted') : null;
  if (seen.has(userId) && (!acted || acted.has(userId))) return;
  seen.add(userId); acted?.add(userId);
  if (addActivity(st.activityDays, day, userId, kind)) {
    if (lastPrune !== day) { lastPrune = day; pruneActivity(st.activityDays, nowMs); }
    db.save();
  }
}

/** Count the caller as "around" on every API call, and as "did something" when a change goes through. A "view as" session is the admin, not the user. */
export function activityMiddleware(req: Request, res: Response, next: NextFunction) {
  const c = ctx();
  if (c.user && !c.impersonatedBy) {
    const uid = String(c.user.id);
    try {
      recordActivity(uid, 'seen');
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        res.on('finish', () => { if (res.statusCode < 400) { try { recordActivity(uid, 'acted'); } catch { /* never block a request for a counter */ } } });
      }
    } catch (e) { console.error('[PULSE] could not record activity', e); }
  }
  next();
}

// ───────────────────────── reading ─────────────────────────
function activityInput(nowMs: number): ActivityInput {
  const st = db.getState();
  const roleById = new Map(st.users.map(u => [u.id, u.role as string]));
  // only the last ~31 days of the audit trail matter; it is in time order, so walk back from the end and stop early
  const cutoff = nowMs - 31 * 86_400_000;
  const recent = [];
  for (let i = st.auditEvents.length - 1; i >= 0; i--) { const e = st.auditEvents[i]; if (Date.parse(e.timestamp) < cutoff) break; recent.push(e); }
  return { days: st.activityDays || [], audit: auditActivity(recent, new Set(roleById.keys())), roleOf: id => roleById.get(id) };
}

const allTrails = (): (MoneyTrail & { projectName: string })[] =>
  db.getState().crmBookings.flatMap(b => (b.trails || []).map(t => ({ ...t, projectName: b.projectName })));

const collectedOf = (b: any) => { try { return collectedPct(b).collected; } catch { return 0; } };
const person = (u: any) => ({ id: u.id, name: u.name, role: u.role, city: u.city || '', companyName: u.companyName || '', status: u.verificationStatus });

export function createPulseRouter() {
  const r = Router();
  r.use(needs('admin:control_center'));

  r.get('/', (_req: Request, res: Response) => {
    const now = Date.now();
    const st = db.getState();
    const inp = activityInput(now);
    const people = st.users.filter(u => !ADMIN_ROLES.includes(u.role));
    const brokers = people.filter(u => u.role === 'BROKER');

    const win = Object.fromEntries(WINDOWS.map(w => [w, windowCounts(windowDays(w, now), inp)])) as Record<WindowKey, ReturnType<typeof windowCounts>>;
    const signups = Object.fromEntries(WINDOWS.map(w => {
      const set = new Set(windowDays(w, now));
      const mine = people.filter(u => set.has(dayOfIso(u.createdAt)));
      return [w, { people: mine.length, brokers: mine.filter(u => u.role === 'BROKER').length }];
    })) as Record<WindowKey, { people: number; brokers: number }>;

    const series = activitySeries(lastDays(30, now), inp);
    const bk = bookingStats(st.crmBookings as any, collectedOf, now);
    const trails = allTrails();
    const ht = holderTotals(trails);
    const open = trails.filter(isOpenTrail);

    res.json({
      success: true,
      asOf: new Date(now).toISOString(),
      today: dayKey(now),
      trackingSince: trackingSince(st.activityDays || []),
      activity: { windows: win, signups, series },
      network: {
        people: people.length,
        verifiedPeople: people.filter(u => u.verificationStatus === 'VERIFIED').length,
        pendingPeople: people.filter(u => u.verificationStatus === 'PENDING').length,
        byRole: people.reduce<Record<string, number>>((m, u) => { m[u.role] = (m[u.role] || 0) + 1; return m; }, {}),
        brokers: { total: brokers.length, verified: brokers.filter(u => u.verificationStatus === 'VERIFIED').length, rera: brokers.filter(u => !!u.reraNumber).length },
      },
      projects: projectStats(st.builderProjects || []),
      bookings: bk,
      money: {
        collectedNetwork: bk.network.collected,
        collectedDirect: bk.direct.collected,
        onTheWay: { count: open.length, amount: ht.COLLECTOR.amount + ht.CP.amount + ht.BUILDER_PENDING.amount, withTeam: ht.COLLECTOR.amount, withPartner: ht.CP.amount, handedOver: ht.BUILDER_PENDING.amount },
        confirmedByBuilder: ht.BUILDER.amount,
        stuck: trailFlags(trails, now).stuck.length,
      },
    });
  });

  /** The list behind a tile. Names and cities only — never a phone number, never a customer. */
  r.get('/drill', (req: Request, res: Response) => {
    const now = Date.now();
    const st = db.getState();
    const kind = String(req.query.kind || '');
    const wq = String(req.query.window || 'today');
    const win: WindowKey | 'all' = wq === 'all' ? 'all' : isWindow(wq) ? wq : 'today';
    const inp = activityInput(now);
    const byId = new Map(st.users.map(u => [u.id, u]));
    const LIMIT = 300;

    if (['people', 'brokers', 'acted', 'actedBrokers'].includes(kind)) {
      const days = windowDays(win === 'all' ? 'd30' : win, now);
      const w = windowSets(days, inp);
      const ids = kind === 'people' ? w.people : kind === 'brokers' ? w.brokers : kind === 'acted' ? w.acted : w.actedBrokers;
      const rows = [...ids].map(id => byId.get(id)).filter(Boolean).map(u => ({ ...person(u), daysActive: daysActive(u!.id, days, inp), lastLoginAt: u!.lastLoginAt || null }))
        .sort((a, b) => b.daysActive - a.daysActive || a.name.localeCompare(b.name));
      return res.json({ success: true, kind, window: win, total: rows.length, rows: rows.slice(0, LIMIT) });
    }

    if (kind === 'signups') {
      const set = new Set(windowDays(win === 'all' ? 'd30' : win, now));
      const rows = st.users.filter(u => !ADMIN_ROLES.includes(u.role) && set.has(dayOfIso(u.createdAt))).map(u => ({ ...person(u), createdAt: u.createdAt }));
      return res.json({ success: true, kind, window: win, total: rows.length, rows: rows.slice(0, LIMIT) });
    }

    if (kind === 'bookings') {
      const status = String(req.query.status || 'ALL').toUpperCase();
      const scope = String(req.query.scope || 'all'); // network | direct | all
      const set = win === 'all' ? null : new Set(windowDays(win, now));
      const rows = st.crmBookings
        .filter(b => (status === 'ALL' || b.status === status) && (scope === 'all' || (scope === 'direct') === !!b.direct))
        .filter(b => !set || set.has(b.status === 'APPROVED' ? soldDay(b as any) : dayOfIso(b.createdAt)))
        .map(b => {
          const c = b.status === 'APPROVED' ? collectedPct(b) : null;
          return {
            id: b.id, projectName: b.projectName, unitNo: b.unitNo, builderName: byId.get(b.builderId)?.companyName || byId.get(b.builderId)?.name || '—',
            associateName: b.direct ? '' : byId.get(b.associateId)?.name || '—', direct: !!b.direct, status: b.status, agreementValue: b.agreementValue,
            collected: c ? Math.round(c.collected) : 0, pct: c ? Math.round(c.pct) : 0, at: b.decidedAt || b.createdAt,
          };
        })
        .sort((a, b) => (a.at < b.at ? 1 : -1));
      return res.json({ success: true, kind, window: win, total: rows.length, value: rows.reduce((a, x) => a + x.agreementValue, 0), rows: rows.slice(0, LIMIT) });
    }

    if (kind === 'projects') {
      const liveOnly = String(req.query.live || '1') !== '0';
      const rows = (st.builderProjects || []).filter(p => !liveOnly || isLiveProject(p)).map(p => ({
        id: p.id, projectName: p.projectName, builderName: p.builderName, city: p.city, stage: p.projectStage, totalUnits: p.totalUnits, availableUnits: p.availableUnits,
        partners: (st.associateMandates || []).filter(m => m.projectId === p.id).length,
      }));
      return res.json({ success: true, kind, total: rows.length, rows: rows.slice(0, LIMIT) });
    }

    if (kind === 'money') {
      const rows = allTrails().filter(isOpenTrail).map(t => ({
        id: t.id, bookingId: t.bookingId, projectName: t.projectName, amount: t.amount, status: t.status, holder: holderOf(t),
        ageDays: Math.floor((now - Date.parse(t.updatedAt)) / 86_400_000),
      })).sort((a, b) => b.ageDays - a.ageDays);
      return res.json({ success: true, kind, total: rows.length, value: rows.reduce((a, x) => a + x.amount, 0), rows: rows.slice(0, LIMIT) });
    }

    res.status(400).json({ error: 'Unknown list' });
  });

  return r;
}
