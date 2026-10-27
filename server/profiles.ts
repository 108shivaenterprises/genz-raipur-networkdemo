/**
 * v78 — Profiles, ratings and reviews.   /api/profiles   (profile:use — every verified account except a shop partner)
 *
 *   GET  /search?q=        find a person: professionals by name / firm / area; ANY member by exact mobile or GZ code
 *                          (a customer or an owner only for a verified broker / builder / counsel / team member). Never a list, never browsable.
 *   GET  /mine             my profile as I edit it + what people said about me + what I wrote
 *   PUT  /mine             edit what my profile shows
 *   GET  /u/:id            one profile: card, rating, reviews, and whether I may review him (and why)
 *   POST /u/:id/review     write or edit my review of him   — only if we really worked together on GENZ (found here, never typed in)
 *   DELETE /u/:id/review   take my review back (within 14 days of writing it)
 *   POST /reviews/:id/reply   the reviewed person's one public reply
 *   POST /reviews/:id/report  report a review
 *   GET  /admin/queue · POST /admin/reviews/:id/hide | restore | clear     (review:moderate — GENZ staff)
 *
 * Safeguards: proof of working together is looked up on the server; one reviewer counts once; a low rating needs a reason; no links / phone numbers in
 * text; searches are rate-limited and the exact-mobile / code ones are written to the audit trail; the reviewed person can reply and report; staff can hide.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { db } from './db.js';
import type { ProfileReview, UserProfile, DatabaseState } from './db.js';
import { ctx, needs, hit, digits, secret, safeEqual } from './auth.js';
import { alert, firstName } from './alerts.js';
import { reputationOf } from './reputation.js';
import {
  groupOfRole, GROUPS, tagsFor, EVIDENCE, summarize, reviewProblem, cleanTags, remarkProblem, mayOpenProfile, canLookupPrivate, isStaffRole,
  searchKind, norm, shortName, REPORT_REASONS, isReportReason, REVIEW_EDIT_DAYS, REPLY_MAX, SEARCH_LIMIT, profileProblem, editableUntil, type TargetGroup, type EvidenceKind,
} from '../src/shared/reviewRules.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const DAY = 86_400_000;
const uid = () => `RV-${Date.now().toString(36).toUpperCase()}${crypto.randomInt(100, 999)}`;
const userOf = (id: string) => st().users.find(u => u.id === id);
const live = (u?: UserProfile) => !!u && !u.erasedAt;
const verified = (u?: UserProfile) => live(u) && u!.verificationStatus === 'VERIFIED';

/** a short-lived pass the search gives out with a private person's card (a customer / an owner): it is what lets the same searcher open that profile, so ids cannot be walked through */
const TICKET_MS = 30 * 60_000;
const sig = (v: string) => crypto.createHmac('sha256', secret()).update(`prof-ticket|${v}`).digest('base64url').slice(0, 24);
export const ticketFor = (viewerId: string, targetId: string, now = Date.now()) => { const exp = now + TICKET_MS; return `${exp}.${sig(`${viewerId}|${targetId}|${exp}`)}`; };
export function ticketOk(t: unknown, viewerId: string, targetId: string, now = Date.now()): boolean {
  const [exp, mac] = String(t ?? '').split('.');
  return !!exp && !!mac && Number(exp) > now && safeEqual(mac, sig(`${viewerId}|${targetId}|${exp}`));
}

// ───────── proof that two people worked together ─────────
export interface Proof { kind: EvidenceKind; id: string; at: string }
const MANDATE_RAN = ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED', 'REVOKED', 'COMPLETED'];
export function proofBetween(a: string, b: string, s: DatabaseState = st()): Proof[] {
  const out: Proof[] = []; const pair = (x?: string, y?: string) => !!x && !!y && ((x === a && y === b) || (x === b && y === a));
  for (const d of s.dealRooms) {
    if (d.stage === 'Lead') continue;
    const ps = new Set([d.introducingBrokerId, d.closingBrokerId, d.ownerId, d.customerId, ...(d.teamMemberIds || [])].filter(Boolean));
    if (ps.has(a) && ps.has(b)) out.push({ kind: 'DEAL', id: d.id, at: d.updatedAt || d.createdAt });
  }
  for (const m of s.associateMandates) if (MANDATE_RAN.includes(m.status) && pair(m.brokerId, m.builderId)) out.push({ kind: 'PARTNERSHIP', id: m.id, at: m.decidedAt || m.assignedAt });
  for (const m of s.ownerMandates) if ((m.status === 'ACTIVE' || m.confirmedAt) && pair(m.ownerId, m.brokerId)) out.push({ kind: 'OWNER_MANDATE', id: m.id, at: m.confirmedAt || m.createdAt });
  for (const l of s.constructionLeads) if (['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(l.status) && pair(l.referringBrokerId, l.assignedContractorId)) out.push({ kind: 'CONSTRUCTION', id: l.id, at: l.createdAt });
  for (const r of s.legalRequests || []) if (r.acceptedAt && pair(r.requestedById, r.counsellorId)) out.push({ kind: 'LEGAL', id: r.id, at: r.acceptedAt });
  return out.sort((x, y) => y.at.localeCompare(x.at));
}

// ───────── what a profile card shows ─────────
const firmOf = (u: UserProfile): string => {
  if (u.role === 'TEAM_MEMBER') { const e = userOf(u.employerId || ''); return e ? (e.brand?.displayName || e.companyName || e.name) : ''; }
  return u.companyName || '';
};
function summaryOf(targetId: string) { return summarize(st().reviews.filter(r => r.targetId === targetId)); }

function cardOf(u: UserProfile, full = false) {
  const g = groupOfRole(u.role) as TargetGroup;
  const p = u.profile || {};
  const active = verified(u);
  const showFull = !GROUPS[g].private;
  const rep = reputationOf(u.id);
  return {
    id: u.id, group: g, groupLabel: GROUPS[g], role: u.role,
    name: showFull ? u.name : shortName(u.name),
    // a customer's or an owner's company name would give his surname away — only a professional's firm is shown
    firm: showFull ? firmOf(u) : '', title: u.role === 'TEAM_MEMBER' ? (u.teamTitle || '') : '',
    city: u.city || '', state: u.state || '',
    status: active ? 'ACTIVE' : 'NOT_ACTIVE',
    // only what a public register already says, plus the checks GENZ did
    code: u.role === 'BROKER' ? (u.brokerId || '') : '',
    rera: (u.role === 'BROKER' || u.role === 'DEVELOPER_BUILDER') && active ? (u.brand?.reraId || u.reraNumber || '') : '',
    checks: active ? { idChecked: !!u.idCheckedAt, photo: !!u.avatarUrl && p.showPhoto !== false, rera: !!(u.reraNumber || u.brand?.reraId) } : { idChecked: false, photo: false, rera: false },
    photoUrl: active && u.avatarUrl && p.showPhoto !== false ? u.avatarUrl : '',
    memberSince: u.createdAt?.slice(0, 7) || '',
    rating: active ? summaryOf(u.id) : { avg: 0, count: 0, early: true, stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, tags: [] },
    ...(full && active ? { about: p.about || '', areas: p.areas || [], languages: p.languages || [], years: p.years ?? null, dealsClosed: rep.closed, confirmedBy: rep.confirmers } : {}),
  };
}

const reviewerCard = (id: string) => {
  const u = userOf(id); if (!live(u)) return { id: '', name: 'Former member', groupLabel: { en: 'Member', hi: 'सदस्य', private: false }, city: '' };
  const g = groupOfRole(u!.role) as TargetGroup;
  return { id: u!.id, name: GROUPS[g]?.private ? shortName(u!.name) : u!.name, groupLabel: GROUPS[g] || { en: 'Member', hi: 'सदस्य', private: false }, city: u!.city || '' };
};

function reviewView(r: ProfileReview, viewer: UserProfile) {
  const mine = r.reviewerId === viewer.id;
  const aboutMe = r.targetId === viewer.id;
  return {
    id: r.id, rating: r.rating, tags: r.tags, remark: r.remark, at: r.at, editedAt: r.editedAt || null, reply: r.reply || null,
    status: r.status, mine, aboutMe,
    worked: EVIDENCE[r.evidenceKind],
    reviewer: reviewerCard(r.reviewerId),
    disputed: r.reports.some(x => x.by === r.targetId),
    ...(mine || aboutMe || isStaffRole(viewer.role) ? { hiddenReason: r.status === 'HIDDEN' ? r.hiddenReason : undefined } : {}),
    ...(mine ? { editableUntil: editableUntil(r.at), editable: Date.now() - Date.parse(r.at) <= REVIEW_EDIT_DAYS * DAY, evidenceCount: r.evidenceIds.length } : {}),
    reported: r.reports.some(x => x.by === viewer.id),
  };
}

/** may this viewer write (or change) a review of this target — and on what proof */
function reviewState(viewer: UserProfile, target: UserProfile) {
  const g = groupOfRole(target.role) as TargetGroup;
  const base = { tags: tagsFor(g), group: g };
  if (viewer.id === target.id) return { ok: false, reason: 'You cannot review yourself.', hi: 'आप ख़ुद को रेट नहीं कर सकते।', ...base };
  if (isStaffRole(viewer.role)) return { ok: false, reason: 'GENZ staff do not write reviews.', hi: 'GENZ स्टाफ रिव्यू नहीं लिखता।', ...base };
  if (!verified(viewer) || !verified(target)) return { ok: false, reason: 'Both accounts must be active.', hi: 'दोनों अकाउंट चालू होने चाहिए।', ...base };
  const proofs = proofBetween(viewer.id, target.id);
  const existing = st().reviews.find(r => r.reviewerId === viewer.id && r.targetId === target.id);
  if (!proofs.length) return { ok: false, reason: 'You can review someone after you have worked together on GENZ (a deal room, a partnership, an owner mandate, a building job or a legal case).', hi: 'रिव्यू तभी लिख सकते हैं जब आपने GENZ पर साथ काम किया हो (डील रूम, पार्टनरशिप, ओनर मैंडेट, निर्माण का काम या क़ानूनी केस)।', ...base };
  if (existing?.status === 'HIDDEN') return { ok: false, reason: 'GENZ removed your earlier review of this person. Please contact support if you think this was a mistake.', hi: 'आपके पिछले रिव्यू को GENZ ने हटाया है। गलती लगे तो सपोर्ट से बात करें।', ...base };
  if (!existing) return { ok: true, proof: proofs[0], ...base };
  const fresh = proofs.find(p => !existing.evidenceIds.includes(p.id));
  const inWindow = Date.now() - Date.parse(existing.editedAt || existing.at) <= REVIEW_EDIT_DAYS * DAY;
  if (inWindow) return { ok: true, proof: proofs[0], editing: true, ...base };
  if (fresh) return { ok: true, proof: fresh, editing: true, newWork: true, ...base };
  return { ok: false, locked: true, reason: `Your review is locked ${REVIEW_EDIT_DAYS} days after you wrote it. You can write a new one after your next deal with this person.`, hi: `रिव्यू लिखने के ${REVIEW_EDIT_DAYS} दिन बाद बदला नहीं जा सकता। इनके साथ अगली डील के बाद नया लिख सकते हैं।`, ...base };
}

/** DPDP: a person's reviews (written and received) and his profile text go with him */
export function eraseProfileData(s: DatabaseState, userId: string): number {
  const before = s.reviews.length;
  s.reviews = s.reviews.filter(r => r.reviewerId !== userId && r.targetId !== userId);
  const u = s.users.find(x => x.id === userId); if (u) u.profile = undefined;
  return before - s.reviews.length;
}
/** DPDP: his own data export — what he wrote and what was written about him (reviewers by short name) */
export function exportProfileData(s: DatabaseState, userId: string) {
  const u = s.users.find(x => x.id === userId);
  return {
    profile: u?.profile || null,
    reviewsAboutMe: s.reviews.filter(r => r.targetId === userId).map(r => ({ at: r.at, rating: r.rating, tags: r.tags, remark: r.remark, reply: r.reply?.text, status: r.status, from: reviewerCard(r.reviewerId).name })),
    reviewsIWrote: s.reviews.filter(r => r.reviewerId === userId).map(r => ({ at: r.at, about: reviewerCard(r.targetId).name, rating: r.rating, tags: r.tags, remark: r.remark, status: r.status })),
  };
}

/** demo only (SEED_DEMO_DATA + SEED_DEMO_BULK): a few honest-looking reviews between demo members who really have a deal / partnership together, so the screen is not empty */
export function seedDemoReviews() {
  if ((process.env.SEED_DEMO_DATA || '').toLowerCase() !== 'true' || (process.env.SEED_DEMO_BULK || '').toLowerCase() !== 'true') return;
  const s = st(); if (s.reviews.length) return;
  const at = (d: number) => new Date(Date.now() - d * DAY).toISOString();
  const mk = (reviewerId: string, targetId: string, rating: number, tags: string[], remark: string, days: number, reply?: string) => {
    const a = userOf(reviewerId); const t = userOf(targetId); if (!verified(a) || !verified(t)) return;
    const p = proofBetween(reviewerId, targetId, s)[0]; if (!p) return;
    s.reviews.push({ id: uid(), targetId, reviewerId, evidenceKind: p.kind, evidenceIds: [p.id], rating, tags, remark, at: at(days), status: 'VISIBLE', reports: [], ...(reply ? { reply: { text: reply, at: at(days - 1) } } : {}) });
  };
  mk('USR-BRK-002', 'USR-BRK-001', 5, ['HONEST', 'FAIR_SPLIT'], 'Closed the Shankar Nagar deal smoothly. My share came in the same week.', 20);
  mk('USR-OWNER-001', 'USR-BRK-001', 5, ['RESPONSIVE', 'ACCURATE'], 'Showed the flat only to serious buyers and kept me updated after every visit.', 12);
  mk('USR-BUILDER-001', 'USR-BRK-001', 4, ['HONEST', 'RESPONSIVE'], 'Registers clean leads and follows up properly.', 9);
  mk('USR-BRK-001', 'USR-BRK-002', 4, ['RESPONSIVE'], 'Good co-broker. Papers came a little late, otherwise no complaint.', 18, 'Thanks — I will keep the documents ready next time.');
  mk('USR-OWNER-001', 'USR-BRK-002', 5, ['HONEST'], 'Explained the price honestly and did not pressure me.', 11);
  mk('USR-BRK-001', 'USR-BUILDER-001', 5, ['PAYS_ON_TIME', 'CLEAR_TERMS'], 'Terms were clear from day one and the brokerage was released on time.', 7);
  mk('USR-BRK-002', 'USR-BUILDER-001', 4, ['GOOD_SUPPORT'], 'Sales team helps with site visits.', 5);
  db.save();
}

/** v80 — an owner who sits on a listing / mandate of THIS broker but has no GENZ login (the broker typed his name and number, or he signed on the link) is not a "member", so the member search never found him
 *  even though the mandate shows him. Only the broker who listed the property can look him up here, and only by the exact mobile he already holds. No profile, no review — just the record. */
export interface OwnerRecord { name: string; last4: string; city: string; listings: { propertyId: string; title: string; mandateId?: string; mandateStatus?: string }[] }
export function ownerRecordFor(brokerId: string, phone10: string, s: DatabaseState = st()): OwnerRecord | null {
  if (!/^\d{10}$/.test(phone10)) return null;
  const key = crypto.createHmac('sha256', secret()).update(`oc-phone|${phone10}`).digest('hex');
  const rows = new Map<string, { name: string; city: string; title: string }>();
  for (const p of s.properties) if (p.listingBrokerId === brokerId && digits(p.ownerPhone).slice(-10) === phone10) rows.set(p.id, { name: p.ownerName, city: p.city || '', title: p.title });
  for (const c of s.ownerConsents) {
    if (c.brokerId !== brokerId || c.ownerPhoneHash !== key || !c.propertyId || c.status === 'VOID') continue;
    const p = s.properties.find(x => x.id === c.propertyId);
    if (p && !rows.has(p.id)) rows.set(p.id, { name: c.ownerTypedName || c.ownerName, city: p.city || '', title: p.title });
  }
  if (!rows.size) return null;
  const first = [...rows.values()][0];
  const listings = [...rows.entries()].slice(0, 5).map(([propertyId, r]) => {
    const m = s.ownerMandates.filter(x => x.propertyId === propertyId && x.brokerId === brokerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return { propertyId, title: r.title, ...(m ? { mandateId: m.id, mandateStatus: m.status } : {}) };
  });
  return { name: shortName(first.name || 'Owner'), last4: phone10.slice(-4), city: first.city, listings };
}

const ALERT_URL = '/?tab=people';

export function createProfilesRouter() {
  const r = Router();
  r.use(needs('profile:use'));
  const slow = (key: string, limit: number, ms: number, res: Response) => {
    const wait = hit(`${key}:${me().id}`, limit, ms);
    if (wait) { res.setHeader('Retry-After', String(wait)); bad(res, 'Too many searches. Please try again a little later.', 429, { hi: 'बहुत ज़्यादा सर्च हो गई। थोड़ी देर बाद फिर कोशिश करें।' }); return true; }
    return false;
  };

  // ── search ──
  r.get('/search', (req: Request, res: Response) => {
    const u = me(); const s = st();
    if (slow('prof-search-h', 40, 3600_000, res) || slow('prof-search-d', 200, 86_400_000, res)) return;
    const { kind, q } = searchKind(req.query.q);
    if (kind === 'TOO_SHORT') return res.json({ success: true, kind, results: [], hint: 'Type at least 3 letters, a GZ code, or a full 10-digit mobile number.', hi: 'कम से कम 3 अक्षर, GZ कोड या पूरा 10 अंकों का मोबाइल नंबर लिखें।' });
    const seeker = u.role;
    const seen = (x: UserProfile) => !!groupOfRole(x.role) && ['VERIFIED', 'SUSPENDED', 'BLACKLISTED'].includes(x.verificationStatus);
    let hits: UserProfile[] = [];
    if (kind === 'PHONE') hits = s.users.filter(x => live(x) && seen(x) && digits(x.phone).slice(-10) === q);
    else if (kind === 'CODE') hits = s.users.filter(x => live(x) && seen(x) && x.brokerId?.toUpperCase() === q);
    else {
      const n = norm(q);
      hits = s.users.filter(x => verified(x) && groupOfRole(x.role) && !GROUPS[groupOfRole(x.role) as TargetGroup].private && x.profile?.visible !== false
        && (norm(x.name).includes(n) || norm(firmOf(x)).includes(n) || norm(x.city).includes(n) || (x.profile?.areas || []).some(a => norm(a).includes(n))));
    }
    // a private person (customer / owner) is shown only to a professional who typed his exact mobile or code
    // a professional who switched off the name search still answers to his exact mobile / code; a private person only to a professional
    const priv = (x: UserProfile) => GROUPS[groupOfRole(x.role) as TargetGroup].private;
    hits = hits.filter(x => x.id !== u.id && (isStaffRole(seeker) || mayOpenProfile({ id: u.id, role: seeker }, { id: x.id, role: x.role, visible: x.profile?.visible }, kind !== 'TEXT' && !priv(x))));
    if (kind !== 'TEXT') db.appendAuditEvent(u.id, u.role, 'SYSTEM', u.id, 'PROFILE_LOOKUP', `${kind === 'PHONE' ? `mobile ending ${q.slice(-4)}` : `code ${q}`} → ${hits.length} found`);
    const cards = hits.map(x => ({ ...cardOf(x), ...(priv(x) || x.profile?.visible === false ? { ticket: ticketFor(u.id, x.id) } : {}) })).sort((a, b) => b.rating.count - a.rating.count || b.rating.avg - a.rating.avg || a.name.localeCompare(b.name)).slice(0, SEARCH_LIMIT);
    // v80 — no member with that mobile, but he is the owner on this broker's own listing / mandate → show him as an owner of record (not a member)
    const record = kind === 'PHONE' && !hits.length && canLookupPrivate(seeker) && !isStaffRole(seeker) ? ownerRecordFor(u.id, q) : null;
    res.json({ success: true, kind, results: cards, total: hits.length, ...(record ? { ownerRecord: record } : {}) });
  });

  // ── my profile ──
  r.get('/mine', (_req: Request, res: Response) => {
    const u = me(); const s = st();
    // GENZ staff have no profile of their own — they search, read and moderate
    if (!groupOfRole(u.role)) return res.json({ success: true, staff: true, card: null, profile: null, group: null, canSearchPrivate: true, reviewsAboutMe: [], reviewsIWrote: [], isPrivate: false });
    const about = s.reviews.filter(x => x.targetId === u.id).sort((a, b) => b.at.localeCompare(a.at)).map(x => reviewView(x, u));
    const wrote = s.reviews.filter(x => x.reviewerId === u.id).sort((a, b) => b.at.localeCompare(a.at)).map(x => ({ ...reviewView(x, u), target: cardOf(userOf(x.targetId) || u) }));
    res.json({ success: true, card: cardOf(u, true), profile: { visible: u.profile?.visible !== false, showPhoto: u.profile?.showPhoto !== false, about: u.profile?.about || '', areas: u.profile?.areas || [], languages: u.profile?.languages || [], years: u.profile?.years ?? null },
      group: groupOfRole(u.role), canSearchPrivate: canLookupPrivate(u.role), reviewsAboutMe: about, reviewsIWrote: wrote, isPrivate: !!GROUPS[groupOfRole(u.role) as TargetGroup]?.private });
  });
  r.put('/mine', (req: Request, res: Response) => {
    const u = me();
    if (!groupOfRole(u.role)) return bad(res, 'GENZ staff do not have a profile.', 403);
    const b = req.body || {};
    const problem = profileProblem(b); if (problem) return bad(res, problem);
    const g = groupOfRole(u.role) as TargetGroup;
    const p = { ...(u.profile || {}) };
    if (typeof b.visible === 'boolean') p.visible = b.visible;
    if (typeof b.showPhoto === 'boolean') p.showPhoto = b.showPhoto;
    if (b.about != null) p.about = String(b.about).trim() || undefined;
    if (Array.isArray(b.areas)) p.areas = b.areas.map((x: string) => x.trim()).filter(Boolean);
    if (Array.isArray(b.languages)) p.languages = b.languages.map((x: string) => x.trim()).filter(Boolean);
    if (b.years != null) p.years = Number(b.years);
    // a private person (customer / owner) is always findable by his exact mobile or code — that is how brokers and builders check he is genuine; he controls the text and the photo
    if (GROUPS[g].private) delete p.visible;
    p.updatedAt = nowIso();
    u.profile = p; db.save();
    res.json({ success: true, card: cardOf(u, true) });
  });

  // ── one profile ──
  r.get('/u/:id', (req: Request, res: Response) => {
    const u = me(); const s = st();
    if (slow('prof-open', 120, 3600_000, res)) return;
    const t = userOf(String(req.params.id));
    if (!t || !live(t) || !groupOfRole(t.role) || !(verified(t) || t.verificationStatus === 'SUSPENDED' || t.verificationStatus === 'BLACKLISTED')) return bad(res, 'Profile not found', 404);
    const proofs = proofBetween(u.id, t.id);
    // a private person (customer / owner) opens only with the pass the exact-mobile / code search gave, or when they really worked together
    if (!mayOpenProfile({ id: u.id, role: u.role }, { id: t.id, role: t.role, visible: t.profile?.visible }, proofs.length > 0 || ticketOk(req.query.t, u.id, t.id))) return bad(res, 'Profile not found', 404);
    if (GROUPS[groupOfRole(t.role) as TargetGroup].private && u.id !== t.id && !isStaffRole(u.role) && !proofs.length && !ticketOk(req.query.t, u.id, t.id)) return bad(res, 'Profile not found', 404);
    const card = cardOf(t, true);
    if (card.status !== 'ACTIVE') return res.json({ success: true, card, reviews: [], review: { ok: false, reason: 'This person is not an active GENZ member.', hi: 'यह व्यक्ति GENZ का सक्रिय सदस्य नहीं है।' } });
    const off = Math.max(0, Number(req.query.offset) || 0);
    const all = s.reviews.filter(x => x.targetId === t.id && (x.status === 'VISIBLE' || x.reviewerId === u.id)).sort((a, b) => b.at.localeCompare(a.at));
    const mineRv = s.reviews.find(x => x.targetId === t.id && x.reviewerId === u.id);
    res.json({ success: true, card, reviews: all.slice(off, off + 10).map(x => reviewView(x, u)), total: all.length, hasMore: all.length > off + 10,
      review: u.id === t.id ? { ok: false } : reviewState(u, t), mine: mineRv ? reviewView(mineRv, u) : null,
      reportReasons: REPORT_REASONS, proofKinds: proofs.map(p => ({ kind: p.kind, label: EVIDENCE[p.kind] })).slice(0, 3) });
  });

  // ── write / edit / withdraw a review ──
  r.post('/u/:id/review', (req: Request, res: Response) => {
    const u = me(); const s = st();
    if (hit(`prof-review:${u.id}`, 20, 86_400_000)) return bad(res, 'You have written many reviews today. Please continue tomorrow.', 429, { hi: 'आज आपने बहुत रिव्यू लिख दिए। कल फिर लिखें।' });
    const t = userOf(String(req.params.id));
    if (!t || !live(t)) return bad(res, 'Profile not found', 404);
    const stt = reviewState(u, t) as any;
    if (!stt.ok) return bad(res, stt.reason, stt.locked ? 409 : 403, { hi: stt.hi, code: stt.locked ? 'LOCKED' : 'NO_PROOF' });
    const g = stt.group as TargetGroup;
    const problem = reviewProblem(g, req.body || {}); if (problem) return bad(res, problem);
    const rating = Number(req.body.rating); const tags = cleanTags(req.body.tags); const remark = String(req.body.remark ?? '').trim();
    let rv = s.reviews.find(x => x.reviewerId === u.id && x.targetId === t.id);
    const wasNew = !rv;
    if (!rv) {
      rv = { id: uid(), targetId: t.id, reviewerId: u.id, evidenceKind: stt.proof.kind, evidenceIds: [stt.proof.id], rating, tags, remark, at: nowIso(), status: 'VISIBLE', reports: [] };
      s.reviews.push(rv);
    } else {
      if (rv.status === 'HIDDEN') return bad(res, 'GENZ removed your earlier review of this person. Please contact support if you think this was a mistake.', 409, { hi: 'आपके पिछले रिव्यू को GENZ ने हटाया है। गलती लगे तो सपोर्ट से बात करें।' });
      if (stt.newWork) { rv.at = nowIso(); rv.evidenceKind = stt.proof.kind; rv.evidenceIds.push(stt.proof.id); rv.reply = undefined; rv.reports = []; }
      Object.assign(rv, { rating, tags, remark, editedAt: nowIso() });
    }
    db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', rv.id, wasNew ? 'REVIEW_WRITTEN' : 'REVIEW_EDITED', `${u.name} rated ${t.id} ${rating}/5 (${rv.evidenceKind} ${stt.proof.id})`);
    const who = GROUPS[groupOfRole(u.role) as TargetGroup]?.private ? firstName(u.name) : u.name;
    alert(t.id, 'community', `${who} rated you ${'★'.repeat(rating)}`, remark ? remark.slice(0, 100) : 'Open your profile to read it and reply.', ALERT_URL, { tag: `rv-${rv.id}`, hi: [`${who} ने आपको ${'★'.repeat(rating)} रेटिंग दी`, remark ? remark.slice(0, 100) : 'पढ़ने और जवाब देने के लिए अपनी प्रोफ़ाइल खोलें।'] });
    res.json({ success: true, review: reviewView(rv, u), rating: summaryOf(t.id) });
  });
  r.delete('/u/:id/review', (req: Request, res: Response) => {
    const u = me(); const s = st();
    const rv = s.reviews.find(x => x.reviewerId === u.id && x.targetId === String(req.params.id));
    if (!rv) return bad(res, 'No review of yours here', 404);
    if (rv.status === 'HIDDEN') return bad(res, 'GENZ has removed this review already.', 409);
    if (Date.now() - Date.parse(rv.at) > REVIEW_EDIT_DAYS * DAY) return bad(res, `A review can be taken back within ${REVIEW_EDIT_DAYS} days of writing it.`, 409, { hi: `रिव्यू लिखने के ${REVIEW_EDIT_DAYS} दिन के अंदर ही वापस लिया जा सकता है।` });
    s.reviews = s.reviews.filter(x => x.id !== rv.id); db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', rv.id, 'REVIEW_WITHDRAWN', `${u.name} took back a review of ${rv.targetId}`);
    res.json({ success: true, rating: summaryOf(rv.targetId) });
  });

  // ── reply / report ──
  r.post('/reviews/:rid/reply', (req: Request, res: Response) => {
    const u = me(); const rv = st().reviews.find(x => x.id === req.params.rid);
    if (!rv || rv.targetId !== u.id) return bad(res, 'Review not found', 404);
    if (rv.status !== 'VISIBLE') return bad(res, 'This review was removed.', 409);
    const text = String(req.body?.text ?? '').trim();
    if (text.length < 2 || text.length > REPLY_MAX) return bad(res, `Write 2 to ${REPLY_MAX} characters`);
    const p = remarkProblem(text); if (p) return bad(res, p.replace('a review', 'a reply'));
    rv.reply = { text, at: nowIso() }; db.save();
    alert(rv.reviewerId, 'community', `${u.name} replied to your review`, text.slice(0, 100), ALERT_URL, { tag: `rvr-${rv.id}`, hi: [`${u.name} ने आपके रिव्यू का जवाब दिया`, text.slice(0, 100)] });
    res.json({ success: true, review: reviewView(rv, u) });
  });
  r.post('/reviews/:rid/report', (req: Request, res: Response) => {
    const u = me(); const s = st();
    if (hit(`prof-report:${u.id}`, 20, 86_400_000)) return bad(res, 'Too many reports today.', 429);
    const rv = s.reviews.find(x => x.id === req.params.rid);
    const t = rv && userOf(rv.targetId);
    if (!rv || !t || rv.status !== 'VISIBLE' || !mayOpenProfile({ id: u.id, role: u.role }, { id: t.id, role: t.role, visible: t.profile?.visible }, proofBetween(u.id, t.id).length > 0)) return bad(res, 'Review not found', 404);
    if (rv.reviewerId === u.id) return bad(res, 'This is your own review — edit or take it back instead.', 400);
    if (rv.reports.some(x => x.by === u.id)) return bad(res, 'You have already reported this review.', 409);
    if (!isReportReason(req.body?.reason)) return bad(res, 'Choose a reason');
    const note = String(req.body?.note ?? '').trim().slice(0, 300);
    rv.reports.push({ by: u.id, reason: req.body.reason, note: note || undefined, at: nowIso() }); db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', rv.id, 'REVIEW_REPORTED', `${u.name} reported review ${rv.id} (${req.body.reason})`);
    res.json({ success: true });
  });

  // ── GENZ staff ──
  r.get('/admin/queue', needs('review:moderate'), (_req: Request, res: Response) => {
    const s = st(); const u = me();
    const row = (x: ProfileReview) => ({ ...reviewView(x, u), target: cardOf(userOf(x.targetId) || u), reportsDetail: x.reports.map(p => ({ by: reviewerCard(p.by).name, byTarget: p.by === x.targetId, reason: p.reason, note: p.note, at: p.at })), hiddenBy: x.hiddenBy, hiddenAt: x.hiddenAt });
    res.json({ success: true,
      reported: s.reviews.filter(x => x.status === 'VISIBLE' && x.reports.length).sort((a, b) => (b.reports.at(-1)?.at || '').localeCompare(a.reports.at(-1)?.at || '')).slice(0, 100).map(row),
      hidden: s.reviews.filter(x => x.status === 'HIDDEN').sort((a, b) => (b.hiddenAt || '').localeCompare(a.hiddenAt || '')).slice(0, 50).map(row) });
  });
  r.post('/admin/reviews/:rid/hide', needs('review:moderate'), (req: Request, res: Response) => {
    const a = me(); const rv = st().reviews.find(x => x.id === req.params.rid);
    if (!rv) return bad(res, 'Review not found', 404);
    const reason = String(req.body?.reason ?? '').trim();
    if (reason.length < 5 || reason.length > 200) return bad(res, 'Write the reason (5 to 200 characters)');
    rv.status = 'HIDDEN'; rv.hiddenReason = reason; rv.hiddenAt = nowIso(); rv.hiddenBy = a.id; db.save();
    db.appendAuditEvent(a.id, a.role, 'SYSTEM', rv.id, 'REVIEW_HIDDEN', `${a.name} hid review ${rv.id}: ${reason}`);
    alert([rv.reviewerId, rv.targetId], 'community', 'A review was removed by GENZ', reason.slice(0, 100), ALERT_URL, { tag: `rvh-${rv.id}`, hi: ['GENZ ने एक रिव्यू हटाया', reason.slice(0, 100)] });
    res.json({ success: true });
  });
  r.post('/admin/reviews/:rid/restore', needs('review:moderate'), (req: Request, res: Response) => {
    const a = me(); const rv = st().reviews.find(x => x.id === req.params.rid);
    if (!rv || rv.status !== 'HIDDEN') return bad(res, 'Review not found', 404);
    rv.status = 'VISIBLE'; rv.hiddenReason = undefined; rv.hiddenAt = undefined; rv.hiddenBy = undefined; db.save();
    db.appendAuditEvent(a.id, a.role, 'SYSTEM', rv.id, 'REVIEW_RESTORED', `${a.name} restored review ${rv.id}`);
    res.json({ success: true });
  });
  r.post('/admin/reviews/:rid/clear', needs('review:moderate'), (req: Request, res: Response) => {
    const a = me(); const rv = st().reviews.find(x => x.id === req.params.rid);
    if (!rv) return bad(res, 'Review not found', 404);
    rv.reports = []; db.save();
    db.appendAuditEvent(a.id, a.role, 'SYSTEM', rv.id, 'REVIEW_REPORTS_CLEARED', `${a.name} kept review ${rv.id} and cleared its reports`);
    res.json({ success: true });
  });
  return r;
}
