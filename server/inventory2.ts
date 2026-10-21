/**
 * v16.8 — the partner's team and the customer: putting units in front of staff, and sharing them with a buyer.
 *
 *  Team board   An employer (partner or builder) posts chosen units to the whole team or to named staff, deciding whether the
 *               post shows the rate and the property features. How much a staff member sees overall is his policy
 *               (Team Control: unit access OFF / SHARED / ALL, price, features, customer links).
 *  Share links  Anyone who may see a unit (partner, builder, an employee allowed to share out) can send a customer a tracked
 *               page of chosen units, and switch the rate and the features ON or OFF for that customer. A person can switch
 *               ON only what he can see himself — a hidden rate can never be shown through a share.
 *
 * GENZ moves no money here and shows no buyer or owner details; the page carries the sharing firm's contact card.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import type { ShareLink, UserProfile } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { actorFor, postsFor, seenBy, type Actor } from './invaccess.js';
import { policyOf } from '../src/shared/pcontrolRules.js';
import { MAX_POST_UNITS, MAX_ACTIVE_POSTS, MAX_SHARE_UNITS, capShareFlags, postIsLive, type TeamPost } from '../src/shared/inventoryRules.js';

const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

const postSchema = z.object({
  projectId: z.string().min(1).max(60),
  unitIds: z.array(z.string().min(1).max(120)).min(1, 'Pick at least one unit').max(MAX_POST_UNITS),
  memberIds: z.array(z.string().min(1).max(60)).max(100).default([]),
  showPrice: z.boolean().default(false),
  showFeatures: z.boolean().default(true),
  note: z.string().trim().max(200).default(''),
  endsAt: z.string().refine(v => !Number.isNaN(Date.parse(v)), 'Invalid end time').optional(),
});

const shareSchema = z.object({
  projectId: z.string().min(1).max(60),
  unitIds: z.array(z.string().min(1).max(120)).min(1, 'Pick at least one unit').max(MAX_SHARE_UNITS),
  showPrice: z.boolean().default(false),
  showFeatures: z.boolean().default(true),
  clientLabel: z.string().trim().max(60).default(''),
  lang: z.enum(['en', 'hi']).default('en'),
});

export function createInventoryDeskRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const bad = (res: Response, msg: string, code = 400) => res.status(code).json({ error: msg });
  const audit = (id: string, action: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', id, action, details); };
  const teamOf = (employerId: string) => db.getState().users.filter(x => x.role === 'TEAM_MEMBER' && x.employerId === employerId);

  // ═════════════════ team board ═════════════════
  /** Posts: an employer sees all his own; an employee sees those addressed to him. */
  r.get('/posts', needs('inventory:read'), (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    let rows: TeamPost[];
    if (u.role === 'TEAM_MEMBER') {
      rows = st.inventoryPosts.filter(p => p.employerId === u.employerId && postIsLive(p) && (p.memberIds.length === 0 || p.memberIds.includes(u.id)));
    } else if (u.role === 'BROKER' || u.role === 'DEVELOPER_BUILDER') {
      rows = st.inventoryPosts.filter(p => p.employerId === u.id);
    } else return bad(res, 'Not available', 403);
    if (projectId) rows = rows.filter(p => p.projectId === projectId);
    const out = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map(p => ({
      ...p, live: postIsLive(p),
      projectName: db.byId('builderProjects', p.projectId)?.projectName || p.projectId,
      unitLabels: p.unitIds.map(id => db.byId('inventoryUnits', id)?.label || id),
      memberNames: p.memberIds.map(id => db.byId('users', id)?.name || id),
    }));
    // an employee never learns whether the price flag was "more restrictive" than his policy — he just sees what he may
    res.json({ success: true, posts: u.role === 'TEAM_MEMBER' ? out.map(({ showPrice, ...x }) => ({ ...x, showPrice: showPrice && policyOf(u).invPrice })) : out });
  });

  r.post('/posts', needs('team:manage'), (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    if (u.role !== 'BROKER' && u.role !== 'DEVELOPER_BUILDER') return bad(res, 'Only a partner or a builder can post units to a team', 403);
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid post');
    const d = parsed.data;
    const a = actorFor(u, d.projectId);
    if (!a) return bad(res, 'Project not found', 404);
    const actor = a.actor;
    const units = st.inventoryUnits.filter(x => x.projectId === d.projectId && d.unitIds.includes(x.id));
    if (units.length !== new Set(d.unitIds).size) return bad(res, 'Some units are not part of this project');
    // you can post only what you can see, and only what is still free
    for (const x of units) {
      if (!seenBy(actor, a.project, x).visible) return bad(res, `Unit ${x.label} is not open to you`);
      if (x.status !== 'AVAILABLE') return bad(res, `Unit ${x.label} is not available any more`, 409);
    }
    const mineIds = new Set(teamOf(u.id).map(x => x.id));
    if (d.memberIds.some(id => !mineIds.has(id))) return bad(res, 'Pick only your own team members');
    if (st.inventoryPosts.filter(p => p.employerId === u.id && postIsLive(p)).length >= MAX_ACTIVE_POSTS) return bad(res, `You can keep ${MAX_ACTIVE_POSTS} live posts — end an old one first`, 409);
    const canPrice = units.every(x => seenBy(actor, a.project, x).price);
    const post: TeamPost = {
      id: uid('POST'), employerId: u.id, projectId: d.projectId, unitIds: [...new Set(d.unitIds)], memberIds: [...new Set(d.memberIds)],
      showPrice: d.showPrice && canPrice, showFeatures: d.showFeatures, note: d.note, createdBy: u.id, createdByName: u.name, createdAt: nowIso(),
      endsAt: d.endsAt, active: true,
    };
    st.inventoryPosts.unshift(post); db.save();
    audit(post.id, 'INVENTORY_POSTED', `${u.name} posted ${units.length} unit(s) of ${a.project.projectName} to ${d.memberIds.length ? `${d.memberIds.length} team member(s)` : 'the whole team'} (price ${post.showPrice ? 'shown' : 'hidden'}, features ${post.showFeatures ? 'shown' : 'hidden'})`);
    res.json({ success: true, post, priceCapped: d.showPrice && !canPrice });
  });

  r.post('/posts/:id/end', needs('team:manage'), (req: Request, res: Response) => {
    const u = me();
    const p = db.getState().inventoryPosts.find(x => x.id === req.params.id && x.employerId === u.id);
    if (!p) return bad(res, 'Post not found', 404);
    p.active = false; db.save();
    audit(p.id, 'INVENTORY_POST_ENDED', `${u.name} ended a team post`);
    res.json({ success: true });
  });

  // ═════════════════ customer share links ═════════════════
  const needShare = needs('inventory:share');

  /** Resolve the units a caller may share, with the flags he may turn on. */
  const resolve = (u: UserProfile, projectId: string, unitIds: string[]):
    { error: string; code?: number } | { project: any; actor: Actor; units: any[]; canPrice: boolean; canFeatures: boolean } => {
    const a = actorFor(u, projectId);
    if (!a) return { error: 'Project not found', code: 404 };
    const { actor, project } = a;
    if (actor.kind === 'ADMIN') return { error: 'Admins do not share units with customers', code: 403 };
    if (actor.kind === 'MEMBER' && !actor.policy.invShareOut) return { error: 'Your employer has not allowed you to send customers unit links', code: 403 };
    const units = db.getState().inventoryUnits.filter(x => x.projectId === projectId && unitIds.includes(x.id));
    if (units.length !== new Set(unitIds).size) return { error: 'Some units are not part of this project' };
    const posts = actor.kind === 'MEMBER' ? postsFor(actor.employer.id, projectId) : undefined;
    let canPrice = true, canFeatures = true;
    for (const x of units) {
      const s = seenBy(actor, project, x, posts);
      if (!s.visible) return { error: `Unit ${x.label} is not open to you`, code: 404 };
      if (x.status !== 'AVAILABLE') return { error: `Unit ${x.label} is not available any more`, code: 409 };
      canPrice &&= s.price; canFeatures &&= s.features;
    }
    return { project, actor, units, canPrice, canFeatures };
  };

  r.post('/shares', needShare, rateLimit('invshare-create', 60, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const parsed = shareSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid request');
    const d = parsed.data;
    const rs = resolve(u, d.projectId, d.unitIds);
    if ('error' in rs) return bad(res, rs.error, rs.code || 400);
    if (st.shareLinks.filter(l => l.ownerId === u.id).length >= 500) return bad(res, 'Too many links — revoke old ones first', 409);
    const flags = capShareFlags({ showPrice: d.showPrice, showFeatures: d.showFeatures }, rs.canPrice, rs.canFeatures);
    const link: ShareLink = {
      token: crypto.randomBytes(8).toString('base64url'), ownerId: u.id, kind: 'UNITS', refId: d.projectId, unitIds: [...new Set(d.unitIds)],
      showPrice: flags.showPrice, showFeatures: flags.showFeatures, employerId: u.role === 'TEAM_MEMBER' ? u.employerId : undefined,
      clientLabel: d.clientLabel, lang: d.lang, createdAt: nowIso(), views: 0, seconds: {}, viewLog: [],
    };
    st.shareLinks.unshift(link); db.save();
    audit(link.token, 'INVENTORY_SHARED', `${u.name} made a customer link for ${rs.units.length} unit(s) of ${rs.project.projectName} (price ${flags.showPrice ? 'shown' : 'hidden'}, features ${flags.showFeatures ? 'shown' : 'hidden'})`);
    res.json({ success: true, token: link.token, path: `/s/${link.token}`, showPrice: flags.showPrice, showFeatures: flags.showFeatures, capped: (d.showPrice && !flags.showPrice) || (d.showFeatures && !flags.showFeatures) });
  });

  /** Own links; an employer also sees what his staff sent (who made it, how many views) — never a customer's identity. */
  r.get('/shares', needShare, (_req, res) => {
    const u = me(); const st = db.getState();
    const mine = u.role === 'TEAM_MEMBER'
      ? st.shareLinks.filter(l => l.ownerId === u.id && l.kind === 'UNITS')
      : st.shareLinks.filter(l => l.kind === 'UNITS' && (l.ownerId === u.id || l.employerId === u.id));
    const rows = mine.map(l => ({
      token: l.token, projectId: l.refId, projectName: db.byId('builderProjects', l.refId)?.projectName || l.refId,
      units: (l.unitIds || []).length, unitLabels: (l.unitIds || []).map(id => db.byId('inventoryUnits', id)?.label || id),
      showPrice: !!l.showPrice, showFeatures: !!l.showFeatures, clientLabel: l.clientLabel, createdAt: l.createdAt, views: l.views, lastViewAt: l.lastViewAt, revoked: !!l.revoked,
      by: l.ownerId === u.id ? undefined : db.byId('users', l.ownerId)?.name,
    })).sort((a, b) => (b.lastViewAt || b.createdAt).localeCompare(a.lastViewAt || a.createdAt)).slice(0, 200);
    res.json({ success: true, links: rows });
  });

  r.post('/shares/:token/revoke', needShare, (req: Request, res: Response) => {
    const u = me();
    const l = db.getState().shareLinks.find(x => x.token === req.params.token && x.kind === 'UNITS' && (x.ownerId === u.id || x.employerId === u.id));
    if (!l) return bad(res, 'Link not found', 404);
    l.revoked = true; db.save();
    res.json({ success: true });
  });

  return r;
}
