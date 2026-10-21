/**
 * v11 — community & rewards: Chapters (F7), non-cash Points + monthly leaderboard (F13), Home-loan referral desk (F19), Academy progress (F14).
 *
 * Points are NEVER money. They buy a 7-day "profile boost" in other brokers' daily digest and unlock badges. There is no
 * pay-per-visit logic anywhere: points come from verified listings, settled deals, verified visits, verified referrals and chapter attendance,
 * with a daily cap and no points for deals between brokers who share a company or phone.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pushTo } from './webpush.js';
import { db } from './db.js';
import type { UserProfile, Chapter, ChapterMeet, LoanReferral, LoanStatus, DatabaseState } from './db.js';
import { ctx, needs, rateLimit, digits } from './auth.js';
import { phoneSchema } from './validation.js';
import { normCity } from '../src/shared/cities.js';
import { LESSONS } from '../src/shared/academy.js';

const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const pad = (n: number) => String(n).padStart(4, '0');
const DAILY_POINT_CAP = 40;
export const BOOST_COST = 100;
export const BADGES = [
  { min: 50, id: 'starter', en: 'Starter', hi: 'स्टार्टर' }, { min: 150, id: 'active', en: 'Active broker', hi: 'सक्रिय ब्रोकर' },
  { min: 400, id: 'pro', en: 'Pro', hi: 'प्रो' }, { min: 1000, id: 'champion', en: 'Champion', hi: 'चैंपियन' },
];

/** Idempotent per (user, kind, refId). Positive awards stop at the daily cap. Returns true when points were added. */
export function awardPoints(userId: string, kind: string, refId: string, points: number): boolean {
  const st = db.getState();
  if (points <= 0) return false;
  if (st.pointEvents.some(e => e.userId === userId && e.kind === kind && e.refId === refId)) return false;
  const today = nowIso().slice(0, 10);
  const earnedToday = st.pointEvents.filter(e => e.userId === userId && e.points > 0 && e.at.startsWith(today)).reduce((a, e) => a + e.points, 0);
  if (earnedToday + points > DAILY_POINT_CAP) return false;
  st.pointEvents.push({ id: `PT-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, userId, kind, refId, points, at: nowIso() });
  db.save();
  return true;
}

const sameParty = (a?: UserProfile, b?: UserProfile) => !a || !b || a.id === b.id || (!!a.companyName && a.companyName.trim().toLowerCase() === (b.companyName || '').trim().toLowerCase()) || digits(a.phone).slice(-10) === digits(b.phone).slice(-10);

/** Pull points for things that already happened (settled deals, verified visits, verified referrals). Safe to run any number of times. */
export function syncPoints(u: UserProfile, st: DatabaseState = db.getState()) {
  for (const d of st.dealRooms) {
    if (d.stage !== 'Settled' || (d.introducingBrokerId !== u.id && d.closingBrokerId !== u.id)) continue;
    const other = st.users.find(x => x.id === (d.introducingBrokerId === u.id ? d.closingBrokerId : d.introducingBrokerId));
    if (sameParty(u, other)) continue; // no points for self-dealing
    awardPoints(u.id, 'DEAL_SETTLED', d.id, 25);
  }
  for (const v of st.siteVisits) if (v.brokerId === u.id && v.isVerified) awardPoints(u.id, 'VISIT_VERIFIED', v.id, 3);
  for (const x of st.users) if (x.invitedById === u.id && x.verificationStatus === 'VERIFIED' && !sameParty(u, x)) awardPoints(u.id, 'REFERRAL_VERIFIED', x.id, 15);
}

export function pointsSummary(u: UserProfile, st: DatabaseState = db.getState()) {
  const ev = st.pointEvents.filter(e => e.userId === u.id);
  const earned = ev.filter(e => e.points > 0).reduce((a, e) => a + e.points, 0);
  const balance = ev.reduce((a, e) => a + e.points, 0);
  const month = nowIso().slice(0, 7);
  return {
    balance, earned, month: ev.filter(e => e.points > 0 && e.at.startsWith(month)).reduce((a, e) => a + e.points, 0),
    badges: BADGES.filter(b => earned >= b.min), nextBadge: BADGES.find(b => earned < b.min) || null,
    boostUntil: u.boostUntil && new Date(u.boostUntil).getTime() > Date.now() ? u.boostUntil : null,
    recent: ev.slice(-8).reverse(), cost: BOOST_COST,
  };
}

const chapterView = (st: DatabaseState, c: Chapter, u: UserProfile) => {
  const members = st.users.filter(x => x.chapterId === c.id && x.verificationStatus === 'VERIFIED');
  const next = st.chapterMeets.filter(m => m.chapterId === c.id && new Date(m.at).getTime() >= Date.now() - 6 * 3600_000).sort((a, b) => a.at.localeCompare(b.at))[0];
  return { id: c.id, name: c.name, city: c.city, zone: c.zone, captain: db.byId('users', c.captainId)?.name || null, members: members.length, isMember: u.chapterId === c.id, isCaptain: c.captainId === u.id, nextMeet: next ? { id: next.id, title: next.title, at: next.at } : null };
};
const canRunChapter = (u: UserProfile, c: Chapter) => c.captainId === u.id || ['ADMIN', 'SUPERADMIN'].includes(u.role);

export function createCommunityRouter() {
  const r = Router();
  const audit = (action: string, id: string, d: string) => db.appendAuditEvent(me().id, me().role, 'SYSTEM', id, action, d);

  // ── feature flags / plan are served by /api/daily/flags ──

  // ── F13 points ──
  r.get('/points', needs('daily:use'), (_req, res) => { const u = me(); syncPoints(u); res.json({ success: true, ...pointsSummary(u) }); });
  r.post('/points/redeem', needs('daily:use'), rateLimit('redeem', 20, 60 * 60_000), (_req: Request, res: Response) => {
    const u = me(); const st = db.getState(); syncPoints(u);
    const sum = pointsSummary(u, st);
    if (sum.balance < BOOST_COST) return res.status(400).json({ error: `You need ${BOOST_COST} points for a 7-day profile boost (you have ${sum.balance}).` });
    st.pointEvents.push({ id: `PT-${Date.now().toString(36)}R`, userId: u.id, kind: 'REDEEM_BOOST', refId: nowIso(), points: -BOOST_COST, at: nowIso() });
    const base = u.boostUntil && new Date(u.boostUntil).getTime() > Date.now() ? new Date(u.boostUntil).getTime() : Date.now();
    const stored = db.byId('users', u.id)!; stored.boostUntil = new Date(base + 7 * 86400000).toISOString();
    db.save(); audit('POINTS_REDEEMED', u.id, `7-day profile boost redeemed for ${BOOST_COST} points (non-cash)`);
    res.json({ success: true, boostUntil: stored.boostUntil });
  });
  r.get('/leaderboard', needs('daily:use'), (_req, res) => {
    const u = me(); const st = db.getState(); const month = nowIso().slice(0, 7);
    const pool = st.users.filter(x => x.role === 'BROKER' && x.verificationStatus === 'VERIFIED' && (u.chapterId ? x.chapterId === u.chapterId : normCity(x.city) === normCity(u.city)));
    const rows = pool.map(x => ({ id: x.id, name: x.name, company: x.companyName || '', points: st.pointEvents.filter(e => e.userId === x.id && e.points > 0 && e.at.startsWith(month)).reduce((a, e) => a + e.points, 0) }))
      .filter(x => x.points > 0).sort((a, b) => b.points - a.points).slice(0, 10);
    res.json({ success: true, scope: u.chapterId ? 'CHAPTER' : 'CITY', month, rows, me: rows.findIndex(x => x.id === u.id) + 1 || null });
  });

  // ── F7 chapters ──
  r.get('/chapters', needs('chapter:read'), (_req, res) => {
    const u = me(); const st = db.getState();
    const mine = normCity(u.city);
    const list = st.chapters.map(c => chapterView(st, c, u)).sort((a, b) => Number(normCity(b.city) === mine) - Number(normCity(a.city) === mine) || a.name.localeCompare(b.name));
    res.json({ success: true, chapters: list, myChapterId: u.chapterId || null });
  });
  r.post('/chapters', needs('chapter:manage'), (req: Request, res: Response) => {
    const st = db.getState();
    const b = z.object({ name: z.string().trim().min(3).max(80), city: z.string().trim().min(2).max(60), zone: z.string().trim().max(60).default(''), captainId: z.string().optional() }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Chapter name and city are required' });
    if (b.data.captainId && !st.users.some(x => x.id === b.data.captainId && x.role === 'BROKER' && x.verificationStatus === 'VERIFIED')) return res.status(400).json({ error: 'Captain must be a verified broker' });
    const c: Chapter = { id: `CH-${pad(st.chapters.length + 1)}`, name: b.data.name, city: normCity(b.data.city), zone: b.data.zone, captainId: b.data.captainId, createdAt: nowIso(), posts: [] };
    st.chapters.push(c); db.save(); audit('CHAPTER_CREATED', c.id, `${c.name} (${c.city})`);
    res.json({ success: true, chapter: chapterView(st, c, me()) });
  });
  r.put('/chapters/:id/captain', needs('chapter:manage'), (req: Request, res: Response) => {
    const st = db.getState(); const c = st.chapters.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Chapter not found' });
    const cap = st.users.find(x => x.id === req.body?.captainId && x.role === 'BROKER' && x.verificationStatus === 'VERIFIED');
    if (!cap) return res.status(400).json({ error: 'Captain must be a verified broker' });
    c.captainId = cap.id; cap.chapterId = c.id; db.save(); audit('CHAPTER_CAPTAIN_SET', c.id, `Captain: ${cap.name}`);
    res.json({ success: true });
  });
  r.post('/chapters/:id/join', needs('chapter:read'), (req: Request, res: Response) => {
    const u = me(); const st = db.getState(); const c = st.chapters.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Chapter not found' });
    if (normCity(c.city) !== normCity(u.city)) return res.status(400).json({ error: `This chapter is for ${c.city}. Your city is ${u.city || 'not set'}.` });
    db.byId('users', u.id)!.chapterId = c.id; db.save();
    res.json({ success: true });
  });
  r.post('/chapters/leave', needs('chapter:read'), (_req, res) => { const st = db.getState(); const x = st.users.find(y => y.id === me().id); if (x) x.chapterId = undefined; db.save(); res.json({ success: true }); });
  r.get('/chapters/:id', needs('chapter:read'), (req: Request, res: Response) => {
    const u = me(); const st = db.getState(); const c = st.chapters.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Chapter not found' });
    const admin = ['ADMIN', 'SUPERADMIN'].includes(u.role);
    if (u.chapterId !== c.id && !admin) return res.status(403).json({ error: 'Join this chapter to see its members and meets.' });
    const person = (x: UserProfile) => ({ id: x.id, name: x.name, company: x.companyName || '', trustScore: x.trustScore ?? null, card: x.publicCard?.enabled && x.referralCode ? `/c/${x.referralCode}` : null });
    const meets = st.chapterMeets.filter(m => m.chapterId === c.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30).map(m => {
      const attended = m.attended.includes(u.id) || canRunChapter(u, c);
      return { id: m.id, title: m.title, at: m.at, venue: m.venue, going: m.rsvps.filter(x => x.going).length, myRsvp: m.rsvps.find(x => x.userId === u.id)?.going ?? null,
        attendees: new Date(m.at).getTime() < Date.now() && attended ? m.attended.map(id => db.byId('users', id)).filter(Boolean).map(x => person(x!)) : undefined };
    });
    res.json({ success: true, chapter: chapterView(st, c, u), members: st.users.filter(x => x.chapterId === c.id && x.verificationStatus === 'VERIFIED').map(person), posts: c.posts.slice(-20).reverse().map(p => ({ ...p, by: db.byId('users', p.by)?.name || 'Captain' })), meets, canRun: canRunChapter(u, c) });
  });
  r.post('/chapters/:id/posts', needs('chapter:read'), rateLimit('chpost', 30, 60 * 60_000), (req: Request, res: Response) => {
    const u = me(); const c = db.getState().chapters.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Chapter not found' });
    if (!canRunChapter(u, c)) return res.status(403).json({ error: 'Only the City Captain can post announcements.' });
    const text = String(req.body?.text || '').trim().slice(0, 600); if (text.length < 3) return res.status(400).json({ error: 'Write the announcement' });
    c.posts.push({ id: `P-${Date.now().toString(36)}`, by: u.id, at: nowIso(), text }); c.posts = c.posts.slice(-50); db.save();
    res.json({ success: true });
  });
  r.post('/chapters/:id/meets', needs('chapter:read'), rateLimit('chmeet', 20, 60 * 60_000), (req: Request, res: Response) => {
    const u = me(); const st = db.getState(); const c = st.chapters.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Chapter not found' });
    if (!canRunChapter(u, c)) return res.status(403).json({ error: 'Only the City Captain can schedule meets.' });
    const b = z.object({ title: z.string().trim().min(3).max(100), at: z.string().datetime(), venue: z.string().trim().min(2).max(160) }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Title, date/time and venue are required' });
    const m: ChapterMeet = { id: `MEET-${pad(st.chapterMeets.length + 1)}`, chapterId: c.id, ...b.data, createdBy: u.id, rsvps: [], attended: [], createdAt: nowIso() };
    st.chapterMeets.push(m); db.save(); res.json({ success: true, meet: m });
    // v26 — every member of the chapter hears about the meet on the phone
    const when = new Date(m.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    for (const x of st.users) if (x.chapterId === c.id && x.id !== u.id && x.verificationStatus === 'VERIFIED') void pushTo(x.id, { kind: 'community', title: `${c.name}: ${m.title}`, body: `${when} · ${m.venue}`, url: '/?tab=community', tag: m.id });
  });
  r.post('/meets/:id/rsvp', needs('chapter:read'), (req: Request, res: Response) => {
    const u = me(); const st = db.getState(); const m = st.chapterMeets.find(x => x.id === req.params.id);
    if (!m || u.chapterId !== m.chapterId) return res.status(404).json({ error: 'Meet not found' });
    const going = req.body?.going !== false;
    const ex = m.rsvps.find(x => x.userId === u.id); if (ex) ex.going = going; else m.rsvps.push({ userId: u.id, going });
    db.save(); res.json({ success: true, going });
  });
  r.post('/meets/:id/attendance', needs('chapter:read'), (req: Request, res: Response) => {
    const u = me(); const st = db.getState(); const m = st.chapterMeets.find(x => x.id === req.params.id);
    const c = m && st.chapters.find(x => x.id === m.chapterId);
    if (!m || !c) return res.status(404).json({ error: 'Meet not found' });
    if (!canRunChapter(u, c)) return res.status(403).json({ error: 'Only the City Captain can mark attendance.' });
    if (new Date(m.at).getTime() > Date.now()) return res.status(400).json({ error: 'The meet has not happened yet.' });
    const ids: string[] = Array.isArray(req.body?.userIds) ? req.body.userIds.filter((x: unknown) => typeof x === 'string').slice(0, 200) : [];
    const valid = ids.filter(id => st.users.some(x => x.id === id && x.chapterId === c.id));
    m.attended = [...new Set(valid)];
    for (const id of m.attended) awardPoints(id, 'CHAPTER_ATTEND', m.id, 10);
    db.save(); audit('MEET_ATTENDANCE', m.id, `${m.attended.length} attended`);
    res.json({ success: true, attended: m.attended.length });
  });

  // ── F19 home-loan desk ──
  const loanSchema = z.object({
    clientName: z.string().trim().min(2).max(80), clientPhone: phoneSchema, amount: z.coerce.number().min(100000).max(5e9),
    city: z.string().trim().min(2).max(60), incomeType: z.enum(['SALARIED', 'SELF_EMPLOYED', 'BUSINESS', 'OTHER']),
    consent: z.literal(true, { message: 'The client must agree to be contacted by the loan desk' }),
  });
  r.post('/loans', needs('loan:submit'), rateLimit('loan', 20, 24 * 60 * 60_000), (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const p = loanSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Please check the form' });
    const now = nowIso();
    const l: LoanReferral = { id: `LN-${pad(st.loanReferrals.length + 1)}`, brokerId: u.id, ...p.data, city: normCity(p.data.city), status: 'SUBMITTED', history: [{ at: now, status: 'SUBMITTED', by: u.id }], createdAt: now, updatedAt: now };
    st.loanReferrals.push(l); db.save(); audit('LOAN_REFERRAL_SUBMITTED', l.id, 'Home-loan referral submitted with client consent');
    res.json({ success: true, loan: l });
  });
  r.get('/loans', needs('loan:submit', 'loan:manage'), (_req, res) => {
    const u = me(); const st = db.getState(); const all = ['ADMIN', 'SUPERADMIN'].includes(u.role);
    const list = st.loanReferrals.filter(l => all || l.brokerId === u.id).slice().reverse().map(l => ({ ...l, brokerName: db.byId('users', l.brokerId)?.name || '—' }));
    res.json({ success: true, loans: list });
  });
  r.post('/loans/:id/status', needs('loan:manage'), (req: Request, res: Response) => {
    const st = db.getState(); const l = st.loanReferrals.find(x => x.id === req.params.id);
    if (!l) return res.status(404).json({ error: 'Referral not found' });
    const b = z.object({ status: z.enum(['SUBMITTED', 'CONTACTED', 'SANCTIONED', 'DISBURSED', 'REJECTED']), sharePct: z.coerce.number().min(0).max(100).optional(), notes: z.string().trim().max(300).optional() }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Invalid status' });
    l.status = b.data.status as LoanStatus; if (b.data.sharePct !== undefined) l.sharePct = b.data.sharePct; if (b.data.notes !== undefined) l.notes = b.data.notes;
    l.history.push({ at: nowIso(), status: l.status, by: me().id }); l.updatedAt = nowIso(); db.save();
    audit('LOAN_STATUS', l.id, `→ ${l.status}`);
    res.json({ success: true, loan: l });
  });

  // ── F14 academy progress (lesson text/videos live in src/shared/academy.ts) ──
  r.get('/academy', needs('academy:read'), (_req, res) => res.json({ success: true, done: db.getState().academyProgress.filter(p => p.userId === me().id).map(p => p.lessonId) }));
  r.post('/academy/:id/done', needs('academy:read'), (req: Request, res: Response) => {
    const st = db.getState(); const id = req.params.id;
    if (!LESSONS.some(l => l.id === id)) return res.status(404).json({ error: 'Lesson not found' });
    if (!st.academyProgress.some(p => p.userId === me().id && p.lessonId === id)) { st.academyProgress.push({ id: `${me().id}:${id}`, userId: me().id, lessonId: id, doneAt: nowIso() }); db.save(); }
    res.json({ success: true });
  });

  return r;
}
