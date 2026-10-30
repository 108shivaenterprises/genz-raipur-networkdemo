/**
 * v92 — the network's live feed (Propi-style "river"): new live listings + needs that brokers sent to the network, newest first.
 * Needs are shown anonymously (never a client name or number). Each row says how it fits the person looking: "N of your clients fit" /
 * "you have N homes for it". Non-RERA (local associate) brokers appear exactly like others, with their level.
 */
import { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import type { UserProfile, Property } from './db.js';
import { ctx, needs } from './auth.js';
import { calculatePropertyMatch } from './matching.js';
import { inferCity } from '../src/shared/places.js';
import { brokerLevel } from '../src/shared/brokerLevel.js';
import { broadcastLine } from './broadcast.js';

const DAYS = 14;
const ck = (s?: string) => String(s || '').trim().toLowerCase();
const liveP = (p: Property) => p.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(p.listingStatus) && !(p as any).heldAt && !(p as any).expiredAt && !(p as any).purgedAt;
const who = (id: string) => {
  const u = db.byId('users', id) as UserProfile | undefined;
  if (!u || u.verificationStatus !== 'VERIFIED') return null;
  const lv = brokerLevel(u);
  return { id: u.id, name: u.name, company: u.companyName || '', level: lv.code, levelEn: lv.en, levelHi: lv.hi, rera: lv.rera };
};

export function createFeedRouter() {
  const r = Router();
  r.get('/', needs('property:read'), (req: Request, res: Response) => {
    const me = ctx().user as UserProfile; const s = db.getState(); const since = Date.now() - DAYS * 86400_000;
    const kind = String(req.query.kind || 'all');
    const myNeeds = s.requirements.filter(q => q.assignedBrokerId === me.id && ['active', 'matching'].includes(q.status));
    const items: any[] = [];
    if (kind !== 'needs') {
      for (const p of s.properties) {
        if (!liveP(p) || Date.parse(p.createdAt || '') < since) continue;
        const b = who(p.listingBrokerId); if (!b) continue;
        let fit = 0;
        if (p.listingBrokerId !== me.id) for (const q of myNeeds) {
          const qc = q.city || inferCity(q.preferredLocalities);
          if (q.transactionType !== p.transactionType || (qc && ck(qc) !== ck(p.city))) continue;
          if (calculatePropertyMatch(p, q).score >= 70) fit++;
        }
        items.push({ kind: 'LISTING', id: p.id, at: p.createdAt, title: p.title, locality: p.locality, city: p.city, type: p.propertyType, deal: p.transactionType, price: p.askingPrice, broker: b, mine: p.listingBrokerId === me.id, myClientsFit: fit });
      }
    }
    if (kind !== 'listings') {
      const myHomes = s.properties.filter(p => p.listingBrokerId === me.id && liveP(p));
      for (const bc of s.broadcasts) {
        if (bc.status !== 'OPEN' || Date.parse(bc.closesAt) < Date.now() || Date.parse(bc.createdAt) < since) continue;
        const b = who(bc.brokerId); if (!b) continue;
        const sm = bc.summary; let have = 0;
        if (bc.brokerId !== me.id) for (const p of myHomes) {
          if (p.transactionType !== sm.transactionType) continue;
          if (sm.city && ck(sm.city) !== ck(p.city)) continue;
          if (!sm.propertyTypes.length || sm.propertyTypes.some(t => ck(t) === ck(p.propertyType))) have++;
        }
        items.push({ kind: 'NEED', id: bc.id, at: bc.createdAt, line: broadcastLine(sm), city: sm.city, localities: sm.localities, deal: sm.transactionType, budgetMin: sm.budgetMin, budgetMax: sm.budgetMax, broker: b, mine: bc.brokerId === me.id, myHomesFit: have });
      }
    }
    items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    res.json({ success: true, days: DAYS, items: items.slice(0, 80) });
  });
  return r;
}
