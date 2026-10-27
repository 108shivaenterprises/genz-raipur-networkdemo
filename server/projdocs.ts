/**
 * v77 — project papers on the partner's side: from the builder, to the broker, to his team, to his client.
 *
 *   GET  /api/projdocs                      the papers I may see (broker: from every project he is appointed on · team member: those his employer showed him)
 *   POST /api/projdocs/posts                broker: show some papers to the whole team or to named staff, and say whether the team may send them to clients
 *   POST /api/projdocs/posts/:id/end        broker: stop that post
 *   POST /api/projdocs/shares               broker / allowed staff: a tracked client page for one paper  (/s/<token>)
 *   GET  /api/projdocs/shares               my links (an employer also sees what his staff sent)
 *   POST /api/projdocs/shares/:token/revoke
 *
 * The builder's choice on the paper (who gets it · how far it may go) is the ceiling and is re-checked on every call, so lowering it,
 * deleting the paper or ending the partnership shuts the door at the next open. No customer details are ever kept: a client link
 * carries only the label the sender typed ("Mr Sharma") — never a phone number.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, BuilderProject, ProjectCollateral, DocPost, ShareLink } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { alert } from './alerts.js';
import { partnerHasMandate } from './invaccess.js';
import { policyOf } from '../src/shared/pcontrolRules.js';
import { docVisibleToBroker, brokerMayPass, postCoversDoc, passOf, MAX_DOC_POSTS } from '../src/shared/docRules.js';

const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;

const postSchema = z.object({
  projectId: z.string().min(1).max(60),
  docIds: z.array(z.string().min(1).max(60)).min(1, 'Pick at least one paper').max(20),
  memberIds: z.array(z.string().min(1).max(60)).max(100).default([]),
  allowClient: z.boolean().default(false),
  note: z.string().trim().max(200).default(''),
});
const shareSchema = z.object({
  projectId: z.string().min(1).max(60),
  docId: z.string().min(1).max(60),
  clientLabel: z.string().trim().max(60).default(''),
  lang: z.enum(['en', 'hi']).default('en'),
});

/** the partner whose running partnership lets a paper travel, for either a broker or his member */
export function docEmployerOf(u: UserProfile): UserProfile | null {
  if (u.role === 'BROKER') return u;
  if (u.role === 'TEAM_MEMBER') { const e = db.byId('users', u.employerId); return e && e.role === 'BROKER' ? e : null; }
  return null;
}
const working = (u: UserProfile | undefined | null) => !!u && u.verificationStatus === 'VERIFIED';

/** may this person (a broker, or a member of one) open this paper because of a post — and may he send it to a client? Used by the routes AND by the public client page. */
export function docAccessFor(u: UserProfile, project: BuilderProject, doc: ProjectCollateral): { open: boolean; client: boolean; via: 'BROKER' | 'POST' | null } {
  const none = { open: false, client: false, via: null as null };
  if (!working(u) || project.status === 'ARCHIVED') return none;
  if (u.role === 'BROKER') {
    const rel = partnerHasMandate(u.id, project.id) ? 'ACTIVE' : 'NONE';
    return { open: docVisibleToBroker(doc, u.id, rel), client: brokerMayPass(doc, u.id, rel, 'CLIENT'), via: 'BROKER' };
  }
  if (u.role !== 'TEAM_MEMBER') return none;
  const emp = docEmployerOf(u);
  if (!emp || !working(emp)) return none;
  const pol = policyOf(u);
  if (pol.onLeave || pol.invMode === 'OFF') return none;
  const rel = partnerHasMandate(emp.id, project.id) ? 'ACTIVE' : 'NONE';
  if (!brokerMayPass(doc, emp.id, rel, 'TEAM')) return none;
  const posts = db.getState().docPosts.filter(p => p.employerId === emp.id && p.projectId === project.id && postCoversDoc(p, doc.id, u.id));
  if (!posts.length) return none;
  return { open: true, client: pol.invShareOut && brokerMayPass(doc, emp.id, rel, 'CLIENT') && posts.some(p => p.allowClient), via: 'POST' };
}

export function createProjDocsRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const bad = (res: Response, msg: string, code = 400) => res.status(code).json({ error: msg });
  const audit = (id: string, action: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', id, action, details); };
  const teamOf = (employerId: string) => db.getState().users.filter(x => x.role === 'TEAM_MEMBER' && x.employerId === employerId);

  const view = (p: BuilderProject, c: ProjectCollateral, extra: Record<string, unknown> = {}) => ({
    id: c.id, projectId: p.id, projectName: p.projectName, builderName: p.builderName, title: c.title, kind: c.kind, url: c.url, note: c.note,
    passOn: passOf(c), addedAt: c.addedAt, ...extra,
  });

  r.get('/', needs('inventory:read'), (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const only = typeof req.query.projectId === 'string' ? req.query.projectId : '';
    if (u.role === 'BROKER') {
      const docs: any[] = [];
      for (const p of st.builderProjects) {
        if ((only && p.id !== only) || p.status === 'ARCHIVED' || !partnerHasMandate(u.id, p.id)) continue;
        for (const c of p.collateral || []) {
          if (!docVisibleToBroker(c, u.id, 'ACTIVE')) continue;
          const live = st.docPosts.filter(x => x.employerId === u.id && x.active && x.docIds.includes(c.id));
          docs.push(view(p, c, { personal: c.audience === 'SELECTED', canTeam: brokerMayPass(c, u.id, 'ACTIVE', 'TEAM'), canClient: brokerMayPass(c, u.id, 'ACTIVE', 'CLIENT'), shownTo: live.length }));
        }
      }
      const team = teamOf(u.id).filter(m => m.verificationStatus === 'VERIFIED').map(m => { const pol = policyOf(m); return { id: m.id, name: m.name, title: m.teamTitle, canSee: pol.invMode !== 'OFF' && !pol.onLeave, canSend: pol.invShareOut }; });
      const posts = st.docPosts.filter(x => x.employerId === u.id && x.active && (!only || x.projectId === only)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50).map(x => ({
        id: x.id, projectId: x.projectId, allowClient: x.allowClient, note: x.note, createdAt: x.createdAt,
        titles: x.docIds.map(id => (db.byId('builderProjects', x.projectId)?.collateral || []).find(c => c.id === id)?.title).filter(Boolean),
        memberNames: x.memberIds.map(id => db.byId('users', id)?.name || id),
      }));
      return res.json({ success: true, role: 'BROKER', docs, team, posts });
    }
    if (u.role === 'TEAM_MEMBER') {
      const docs: any[] = [];
      for (const p of st.builderProjects) {
        if ((only && p.id !== only)) continue;
        for (const c of p.collateral || []) {
          const a = docAccessFor(u, p, c);
          if (!a.open) continue;
          const post = st.docPosts.filter(x => x.employerId === u.employerId && x.projectId === p.id && postCoversDoc(x, c.id, u.id)).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
          // the builder's own note is for the partner; what the team reads is what the partner wrote when he showed it
          docs.push(view(p, c, { note: undefined, canClient: a.client, fromNote: post?.note || undefined }));
        }
      }
      return res.json({ success: true, role: 'TEAM_MEMBER', docs, team: [], posts: [] });
    }
    return bad(res, 'Not available', 403);
  });

  // ── broker → team ──
  r.post('/posts', needs('team:manage'), (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    if (u.role !== 'BROKER') return bad(res, 'Only a partner can show papers to his team', 403);
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid post');
    const d = parsed.data;
    const p = db.byId('builderProjects', d.projectId);
    if (!p || !partnerHasMandate(u.id, p.id)) return bad(res, 'Project not found', 404);
    const docs = d.docIds.map(id => (p.collateral || []).find(c => c.id === id));
    if (docs.some(c => !c)) return bad(res, 'Some papers are not part of this project');
    for (const c of docs as ProjectCollateral[]) {
      if (!docVisibleToBroker(c, u.id, 'ACTIVE')) return bad(res, `“${c.title}” is not open to you`, 404);
      if (!brokerMayPass(c, u.id, 'ACTIVE', 'TEAM')) return bad(res, `The builder has kept “${c.title}” for you alone — it cannot be shown to your team`, 403);
      if (d.allowClient && !brokerMayPass(c, u.id, 'ACTIVE', 'CLIENT')) return bad(res, `The builder has not allowed “${c.title}” to be sent to clients`, 403);
    }
    const mine = new Map(teamOf(u.id).map(m => [m.id, m]));
    if (d.memberIds.some(id => !mine.has(id))) return bad(res, 'Pick only your own team members');
    const who = (d.memberIds.length ? d.memberIds : [...mine.keys()]).filter(id => { const m = mine.get(id)!; return m.verificationStatus === 'VERIFIED' && policyOf(m).invMode !== 'OFF'; });
    if (!who.length) return bad(res, 'None of these people can open project papers yet — turn on their Inventory access in Team first', 409);
    if (st.docPosts.filter(x => x.employerId === u.id && x.active).length >= MAX_DOC_POSTS) return bad(res, `You can keep ${MAX_DOC_POSTS} live posts — end an old one first`, 409);
    const post: DocPost = { id: uid('DPOST'), employerId: u.id, projectId: p.id, docIds: [...new Set(d.docIds)], memberIds: [...new Set(d.memberIds)], allowClient: d.allowClient, note: d.note, createdBy: u.id, createdByName: u.name, createdAt: nowIso(), active: true };
    st.docPosts.unshift(post); db.save();
    const titles = (docs as ProjectCollateral[]).map(c => c.title).join(', ').slice(0, 100);
    alert(who, 'deals', `${p.projectName}: ${post.docIds.length === 1 ? titles : `${post.docIds.length} papers`}`, `${u.name} shared ${post.docIds.length === 1 ? 'a paper' : 'papers'} with you${d.allowClient ? ' — you may send them to clients' : ''}`, '/?tab=crm', { not: u.id, tag: `dpost-${post.id}`, hi: [`${p.projectName}: ${post.docIds.length === 1 ? titles : `${post.docIds.length} काग़ज़`}`, `${u.name} ने आपके साथ ${post.docIds.length === 1 ? 'एक काग़ज़' : 'काग़ज़'} साझा ${post.docIds.length === 1 ? 'किया' : 'किए'}${d.allowClient ? ' — आप इन्हें क्लाइंट को भेज सकते हैं' : ''}`] });
    audit(post.id, 'PROJECT_DOC_POSTED', `${u.name} showed ${post.docIds.length} paper(s) of ${p.projectName} to ${d.memberIds.length ? `${d.memberIds.length} team member(s)` : 'the whole team'} (clients: ${d.allowClient ? 'may be sent' : 'no'})`);
    res.json({ success: true, post: { id: post.id } });
  });

  r.post('/posts/:id/end', needs('team:manage'), (req: Request, res: Response) => {
    const u = me();
    const x = db.getState().docPosts.find(y => y.id === req.params.id && y.employerId === u.id);
    if (!x) return bad(res, 'Post not found', 404);
    x.active = false; db.save();
    audit(x.id, 'PROJECT_DOC_POST_ENDED', `${u.name} stopped showing papers to the team`);
    res.json({ success: true });
  });

  // ── a client page for one paper ──
  r.post('/shares', needs('inventory:share'), rateLimit('projdoc-share', 60, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const parsed = shareSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid request');
    const d = parsed.data;
    const p = db.byId('builderProjects', d.projectId);
    const c = p && (p.collateral || []).find(x => x.id === d.docId);
    if (!p || !c) return bad(res, 'Paper not found', 404);
    const a = docAccessFor(u, p, c);
    if (!a.open) return bad(res, 'Paper not found', 404);
    if (!a.client) return bad(res, 'This paper may not be sent to clients', 403);
    if (st.shareLinks.filter(l => l.ownerId === u.id).length >= 500) return bad(res, 'Too many links — revoke old ones first', 409);
    const link: ShareLink = {
      token: crypto.randomBytes(8).toString('base64url'), ownerId: u.id, kind: 'DOC', refId: p.id, docId: c.id,
      employerId: u.role === 'TEAM_MEMBER' ? u.employerId : undefined, clientLabel: d.clientLabel, lang: d.lang, createdAt: nowIso(), views: 0, seconds: {}, viewLog: [],
    };
    st.shareLinks.unshift(link); db.save();
    audit(link.token, 'PROJECT_DOC_SHARED', `${u.name} made a client page for “${c.title}” of ${p.projectName}`);
    res.json({ success: true, token: link.token, path: `/s/${link.token}` });
  });

  r.get('/shares', needs('inventory:share'), (_req, res) => {
    const u = me(); const st = db.getState();
    const mine = u.role === 'TEAM_MEMBER' ? st.shareLinks.filter(l => l.kind === 'DOC' && l.ownerId === u.id) : st.shareLinks.filter(l => l.kind === 'DOC' && (l.ownerId === u.id || l.employerId === u.id));
    const links = mine.map(l => {
      const p = db.byId('builderProjects', l.refId);
      return { token: l.token, projectName: p?.projectName || l.refId, title: (p?.collateral || []).find(c => c.id === l.docId)?.title || '—', clientLabel: l.clientLabel, createdAt: l.createdAt, views: l.views, lastViewAt: l.lastViewAt, revoked: !!l.revoked, by: l.ownerId === u.id ? undefined : db.byId('users', l.ownerId)?.name };
    }).sort((a, b) => (b.lastViewAt || b.createdAt).localeCompare(a.lastViewAt || a.createdAt)).slice(0, 100);
    res.json({ success: true, links });
  });

  r.post('/shares/:token/revoke', needs('inventory:share'), (req: Request, res: Response) => {
    const u = me();
    const l = db.getState().shareLinks.find(x => x.token === req.params.token && x.kind === 'DOC' && (x.ownerId === u.id || x.employerId === u.id));
    if (!l) return bad(res, 'Link not found', 404);
    l.revoked = true; db.save();
    res.json({ success: true });
  });

  return r;
}
