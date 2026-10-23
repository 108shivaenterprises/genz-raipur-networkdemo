/**
 * v56 — saved homes (a buyer's shortlist).   /api/saved
 *   GET  /            the homes I saved, with the public facts any member already sees in Properties (title, place, type, price, first photo)
 *   POST /:propertyId save / unsave (toggle)
 * Only the property id is stored. Nobody else — not the listing broker, not GENZ staff on a screen — is told who saved what;
 * the listing broker sees nothing new (no lead is created, so the buyer is not handed to anyone).
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { db } from './db.js';
import type { UserProfile, Property } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';

const MAX_SAVED = 100;
const me = () => ctx().user as UserProfile;
const live = (p?: Property) => !!p && p.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(p.listingStatus);
const card = (p: Property) => ({
  id: p.id, title: p.title, locality: p.locality, city: p.city, propertyType: p.propertyType, transactionType: p.transactionType,
  askingPrice: p.askingPrice, image: (p.images || []).find(x => typeof x === 'string' && x.length < 400), available: live(p), status: p.listingStatus,
});

export function createSavedRouter() {
  const r = Router();
  r.get('/', needs('property:read'), (_req: Request, res: Response) => {
    const u = me(); const s = db.getState();
    const mine = (s.savedProperties || []).filter(x => x.userId === u.id).sort((a, b) => b.at.localeCompare(a.at));
    const saved = mine.map(x => { const p = s.properties.find(q => q.id === x.propertyId); return p && p.verificationStatus === 'VERIFIED' ? { ...card(p), savedAt: x.at } : null; }).filter(Boolean);
    res.json({ success: true, ids: mine.map(x => x.propertyId), saved });
  });
  r.post('/:propertyId', needs('property:read'), rateLimit('saved', 200, 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = db.getState();
    const list = (s.savedProperties ||= []);
    const i = list.findIndex(x => x.userId === u.id && x.propertyId === req.params.propertyId);
    if (i >= 0) { list.splice(i, 1); db.save(); return res.json({ success: true, saved: false }); }
    const p = s.properties.find(q => q.id === req.params.propertyId);
    if (!live(p)) return res.status(404).json({ error: 'This home is not available to save.', hi: 'यह घर सेव नहीं हो सकता (उपलब्ध नहीं)।' });
    if (list.filter(x => x.userId === u.id).length >= MAX_SAVED) return res.status(400).json({ error: `You can keep ${MAX_SAVED} saved homes — remove some first.`, hi: `आप ${MAX_SAVED} घर सेव रख सकते हैं — पहले कुछ हटाएँ।` });
    list.push({ id: `SAV-${crypto.randomBytes(5).toString('hex')}`, userId: u.id, propertyId: p!.id, at: new Date().toISOString() });
    db.save();
    res.json({ success: true, saved: true });
  });
  return r;
}
