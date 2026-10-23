/**
 * v26 — reputation that travels + the broker's home summary.
 *   /api/reputation   GET /pending, POST /confirm    — "deal sahi hui": a broker confirms a SETTLED deal room with another broker
 *   /api/home         GET /broker                    — one call for the simple broker home (first-run steps, counts, chapter)
 *
 * A confirmation is one line: broker A says the deal with broker B went fine. It shows on B's public card and listing pages as
 * "N deals closed on GENZ · confirmed by M brokers" (counts only — no deal, client or money detail). Points-only reward.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import type { DealRoom, PeerConfirm, UserProfile } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { awardPoints } from './community.js';
import { pushTo } from './webpush.js';
import { ensureReferralCode } from './growth.js';
import { insightsFor } from './homeinsights.js';
import { partnerCounts } from './shopPartners.js';
import { pageCounts, pageSummary } from './publicPage.js';
import { billCounts } from './payreq.js';

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const me = () => ctx().user as UserProfile;
const brokersOf = (d: DealRoom) => [...new Set([d.introducingBrokerId, d.closingBrokerId].filter(Boolean))];

export function reputationOf(userId: string) {
  const s = st();
  const closed = s.dealRooms.filter(d => d.stage === 'Settled' && brokersOf(d).includes(userId)).length;
  const conf = s.peerConfirms.filter(c => c.toId === userId);
  return { closed, confirmations: conf.length, confirmers: new Set(conf.map(c => c.fromId)).size };
}
/** one line for public pages, or '' when there is nothing to say */
export function reputationLine(userId: string, hi = false) {
  const r = reputationOf(userId);
  if (!r.closed && !r.confirmers) return '';
  return hi ? `GENZ पर ${r.closed} सौदे पूरे${r.confirmers ? ` · ${r.confirmers} ब्रोकरों ने पुष्टि की` : ''}` : `${r.closed} deal${r.closed === 1 ? '' : 's'} closed on GENZ${r.confirmers ? ` · confirmed by ${r.confirmers} broker${r.confirmers === 1 ? '' : 's'}` : ''}`;
}

function pendingFor(u: UserProfile) {
  const s = st();
  const out: { kind: 'DEAL_ROOM'; refId: string; toId: string; toName: string; title: string }[] = [];
  for (const d of s.dealRooms) {
    if (d.stage !== 'Settled') continue;
    const bs = brokersOf(d);
    if (!bs.includes(u.id)) continue;
    for (const other of bs) {
      if (other === u.id) continue;
      if (s.peerConfirms.some(c => c.kind === 'DEAL_ROOM' && c.refId === d.id && c.fromId === u.id && c.toId === other)) continue;
      const o = db.byId('users', other) as UserProfile | undefined;
      if (!o) continue;
      out.push({ kind: 'DEAL_ROOM', refId: d.id, toId: other, toName: o.name, title: (d as any).title || (d as any).propertyTitle || d.id });
    }
  }
  return out.slice(0, 20);
}

export function createReputationRouter() {
  const r = Router();
  r.get('/pending', needs('deal:read'), (_req: Request, res: Response) => {
    const u = me();
    res.json({ success: true, items: pendingFor(u), mine: reputationOf(u.id) });
  });
  r.post('/confirm', needs('deal:read'), rateLimit('peer-confirm', 60, 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const refId = String(req.body?.refId || ''); const toId = String(req.body?.toId || '');
    const p = pendingFor(u).find(x => x.refId === refId && x.toId === toId);
    if (!p) return res.status(404).json({ error: 'Nothing to confirm here' });
    const c: PeerConfirm = { id: `PC-${Date.now().toString(36).toUpperCase()}${crypto.randomInt(100, 999)}`, kind: 'DEAL_ROOM', refId, fromId: u.id, toId, note: String(req.body?.note || '').trim().slice(0, 200), at: nowIso() };
    s.peerConfirms.push(c);
    awardPoints(toId, 'PEER_CONFIRM', c.id, 10);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'DEAL', refId, 'PEER_CONFIRMED', `${u.name} confirmed the settled deal with ${p.toName}`);
    void pushTo(toId, { kind: 'deals', title: `${u.name} confirmed your deal ✔`, body: 'It now shows on your GENZ card.', url: '/?tab=grow', tag: c.id });
    res.json({ success: true, mine: reputationOf(u.id) });
  });
  return r;
}

/** the simple broker home: first-run steps + what needs attention today (counts only) */
export function createHomeRouter() {
  const r = Router();
  /** v31 — the extras on every other role's home */
  r.get('/insights', needs('self:read'), (_req: Request, res: Response) => res.json({ success: true, insights: insightsFor(me()) }));
  r.get('/broker', needs('self:read'), (_req: Request, res: Response) => {
    const u = me(); const s = st(); const now = Date.now();
    const myListings = s.properties.filter(p => p.listingBrokerId === u.id && ['active', 'under_negotiation', 'pending_verification', 'draft'].includes(p.listingStatus));
    const drafts = s.listingDrafts.filter(d => d.brokerId === u.id && ['DRAFT', 'CONSENT_PENDING', 'READY'].includes(d.status));
    const reqs = s.requirements.filter(x => x.assignedBrokerId === u.id && ['active', 'matching'].includes(x.status));
    const clients = s.clientCards.filter(c => c.brokerId === u.id && c.stage !== 'LOST');
    const inbox = s.broadcasts.filter(b => b.status === 'OPEN' && Date.parse(b.closesAt) > now && b.recipients.includes(u.id) && !b.responses.some(x => x.brokerId === u.id)).length;
    const answers = s.broadcasts.filter(b => b.brokerId === u.id && b.status === 'OPEN').reduce((a, b) => a + b.responses.length, 0);
    const followUps = clients.filter(c => c.followUpAt && Date.parse(c.followUpAt) <= now + 86400_000).length;
    const chapter = u.chapterId ? s.chapters.find(c => c.id === u.chapterId) : undefined;
    const nextMeet = chapter ? s.chapterMeets.filter(m => m.chapterId === chapter.id && Date.parse(m.at) >= now - 3 * 3600_000).sort((a, b) => a.at.localeCompare(b.at))[0] : undefined;
    const month = nowIso().slice(0, 7);
    // v29 — buyer bonds: active ones, co-broke requests on them (last 14 days), and "your buyer's property was marked sold"
    const myBonds = (s.buyerBonds || []).filter(b => b.brokerId === u.id && b.status === 'ACTIVE' && Date.parse(b.expiresAt) > now);
    const pool = s.users.filter(x => x.role === 'BROKER' && x.verificationStatus === 'VERIFIED' && (u.chapterId ? x.chapterId === u.chapterId : String(x.city || '').toLowerCase() === String(u.city || '').toLowerCase()));
    const pts = (id: string) => s.pointEvents.filter(e => e.userId === id && e.points > 0 && e.at.startsWith(month)).reduce((a, e) => a + e.points, 0);
    const ranked = pool.map(x => ({ id: x.id, p: pts(x.id) })).sort((a, b) => b.p - a.p);
    res.json({
      success: true,
      firstRun: { listing: myListings.length > 0 || s.properties.some(p => p.listingBrokerId === u.id), client: reqs.length > 0 || clients.length > 0, card: !!u.publicCard?.enabled },
      counts: {
        listings: myListings.length, drafts: drafts.length, readyToPublish: drafts.filter(d => d.status === 'READY').length,
        waitingOwner: drafts.filter(d => d.status === 'CONSENT_PENDING').length, protectedListings: myListings.filter(p => p.protectionUntil && Date.parse(p.protectionUntil) > now).length,
        requirements: reqs.length, clients: clients.length, followUps, inbox, answers, toConfirm: pendingFor(u).length,
        buyerBonds: myBonds.length,
        ...roomCounts(s, u.id), ...shareCounts(s, u.id), ...partnerCounts(u.id), ...pageCounts(u.id), ...billCounts(u.id), bondAsks: myBonds.reduce((n, b) => n + b.asks.filter(x => Date.parse(x.at) > now - 14 * 86400_000).length, 0), bondAlerts: myBonds.filter(b => b.closedNotice).length,
      },
      reputation: reputationOf(u.id),
      page: u.role === 'BROKER' ? pageSummary(u) : null,
      chapter: chapter ? { id: chapter.id, name: chapter.name, captain: (db.byId('users', chapter.captainId) as UserProfile | undefined)?.name || null, isCaptain: chapter.captainId === u.id, nextMeet: nextMeet ? { title: nextMeet.title, at: nextMeet.at, venue: nextMeet.venue } : null } : null,
      rank: { month, position: ranked.findIndex(x => x.id === u.id) + 1 || null, of: ranked.length, points: pts(u.id) },
      refCode: u.role === 'BROKER' && u.verificationStatus === 'VERIFIED' ? ensureReferralCode(u) : null, city: u.city || '',
    });
  });
  return r;
}


/** v31 — Client Rooms: new messages from my clients and visit requests waiting */
function roomCounts(s: any, uid: string) {
  const rooms = (s.clientRooms || []).filter((r: any) => r.brokerId === uid && r.status === 'ACTIVE');
  return {
    roomMsgs: rooms.reduce((n: number, r: any) => n + r.messages.filter((m: any) => m.from === 'CLIENT' && (!r.lastBrokerSeenAt || m.at > r.lastBrokerSeenAt)).length, 0),
    roomCodes: rooms.filter((r: any) => r.otpPlain && r.otpExpires && Date.parse(r.otpExpires) > Date.now()).length,
    roomVisits: rooms.reduce((n: number, r: any) => n + r.items.reduce((k: number, i: any) => k + i.visitRequests.filter((v: any) => v.status === 'REQUESTED').length, 0), 0),
  };
}
/** v31 — connector share: a proposal to answer, or an agreed share still to be worked out / paid */
function shareCounts(s: any, uid: string) {
  const mine = (s.connectorReferrals || []).filter((x: any) => x.share && (x.assignedToId === uid || x.sponsorId === uid));
  return {
    shareAsks: mine.filter((x: any) => x.share.status === 'PROPOSED' && x.share.proposedBy === 'CONNECTOR').length,
    shareToPay: mine.filter((x: any) => (x.share.status === 'AGREED' && x.status === 'CLOSED_WON') || x.share.status === 'NOT_RECEIVED').length,
  };
}
