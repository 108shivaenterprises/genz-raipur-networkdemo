/**
 * DPDP Act 2023 (India) — data-principal rights: access/portability, correction, erasure, grievance.
 * Template implementation: have counsel review the retention periods and wording before launch.
 */
import { Router, Request, Response } from 'express';
import { db, PrivacyRequest } from './db.js';
import { ctx, needs, requireAuth, rateLimit, unusablePasswordHash } from './auth.js';
import { isSuper } from './access.js';
import { sha256 } from './db.js';
import { purgeUserDocs } from './propdocs.js';
import { purgeUserIdDocs } from './idreview.js';
import { purgeUserPhotos } from './profilephoto.js';
import { purgeKyc, kycFlags } from './kycvault.js';
import { erasePhoto } from './workphotos.js';

export const POLICY_VERSION = '2026-10-17';

export function legalConfig() {
  return {
    policyVersion: POLICY_VERSION,
    company: process.env.COMPANY_NAME || 'GENZ BUILDCON INFRA PVT LTD',
    address: process.env.COMPANY_ADDRESS || 'Raipur, Chhattisgarh, India',
    grievanceOfficer: {
      name: process.env.GRIEVANCE_NAME || 'Grievance Officer, GENZ Broker Network',
      email: process.env.GRIEVANCE_EMAIL || 'grievance@genzbuildcon.com',
      phone: process.env.GRIEVANCE_PHONE || '',
      responseDays: 15,
    },
    retentionNote: 'Audit-ledger and transaction records are retained for 8 years for legal, tax and RERA compliance; they are anonymised, not deleted, on erasure.',
  };
}

export function createPrivacyRouter() {
  const r = Router();
  const me = () => ctx().user;

  // Everything the platform holds about the signed-in user (machine-readable).
  r.get('/export', requireAuth, rateLimit('export', 5, 60 * 60_000), (_req: Request, res: Response) => {
    const u = me();
    const s = db.getState();
    const mine = <T extends Record<string, any>>(rows: T[], ...keys: string[]) => rows.filter(x => keys.some(k => x[k] === u.id));
    const { passwordHash: _p, sessionVersion: _s, mustChangePassword: _m, ...profile } = u as any;
    const bundle = {
      exportedAt: new Date().toISOString(),
      policyVersion: POLICY_VERSION,
      profile,
      properties: mine(s.properties, 'ownerId', 'listingBrokerId'),
      requirements: mine(s.requirements, 'brokerId', 'ownerId', 'createdBy'),
      dealRooms: s.dealRooms.filter(d => d.introducingBrokerId === u.id || d.closingBrokerId === u.id || d.ownerId === u.id).map(d => ({ ...d, brokerBook: undefined, myBrokerBook: d.brokerBook?.[u.id] })), // v71 — only MY brokerage book
      siteVisits: mine(s.siteVisits, 'brokerId'),
      crmLeads: mine(s.crmLeads, 'associateId', 'builderId'),
      crmBookings: mine(s.crmBookings, 'associateId', 'builderId'),
      disputes: s.disputes.filter(d => (d as any).raisedBy === u.id || (d as any).againstUserId === u.id),
      privacyRequests: mine(s.privacyRequests, 'userId'),
      // v60 / v61 — his Rent desk records and the messages he wrote in builder ↔ partner chats
      tenancies: mine(s.tenancies || [], 'brokerId'),
      partnerChatMessages: (s.partnerThreads || []).flatMap(t => t.messages.filter(m => m.byId === u.id).map(m => ({ thread: t.id, at: m.at, text: m.text, card: m.card ? { kind: m.card.kind, label: m.card.label } : undefined }))),
      // v25: the encrypted vault is summarised (what is kept, when, and who opened it) — the number itself is never put in an export file
      kycVault: (() => { const r = s.kycVault.find(x => x.userId === u.id); return r ? { ...kycFlags(u.id), openedBy: r.views.map(v => ({ at: v.at, by: v.byName, purpose: v.purpose, reason: v.reason })) } : null; })(),
      auditEventsByYou: s.auditEvents.filter(e => e.actorId === u.id),
    };
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', u.id, 'DATA_EXPORT', 'User exported their personal data (DPDP access right)');
    res.setHeader('Content-Disposition', `attachment; filename="genz-my-data-${u.id}.json"`);
    res.json(bundle);
  });

  // Correction / erasure / grievance requests are queued for the Grievance Officer (admin).
  r.post('/requests', requireAuth, rateLimit('privreq', 10, 24 * 60 * 60_000), (req: Request, res: Response) => {
    const u = me();
    const { type, details } = req.body || {};
    if (!['ERASURE', 'CORRECTION', 'GRIEVANCE'].includes(type)) return res.status(400).json({ error: 'Invalid request type' });
    const text = String(details || '').trim().slice(0, 2000);
    if (type !== 'ERASURE' && text.length < 5) return res.status(400).json({ error: 'Please describe your request' });
    const s = db.getState();
    if (s.privacyRequests.some(p => p.userId === u.id && p.type === type && p.status === 'OPEN')) {
      return res.status(409).json({ error: 'You already have an open request of this type' });
    }
    const pr: PrivacyRequest = {
      id: `PRV-${Date.now().toString(36).toUpperCase()}`,
      userId: u.id, userName: u.name, type, details: text, status: 'OPEN', createdAt: new Date().toISOString(),
    };
    s.privacyRequests.unshift(pr);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', pr.id, 'PRIVACY_REQUEST_FILED', `${type} request filed by ${u.name}`);
    res.json({ success: true, request: pr, respondWithinDays: legalConfig().grievanceOfficer.responseDays });
  });

  r.get('/requests', requireAuth, (_req: Request, res: Response) => {
    const u = me();
    const s = db.getState();
    const all = u.role === 'SUPERADMIN' || u.role === 'ADMIN';
    res.json({ success: true, requests: all ? s.privacyRequests : s.privacyRequests.filter(p => p.userId === u.id) });
  });

  r.post('/requests/:id/resolve', needs('users:review'), (req: Request, res: Response) => {
    const actor = me();
    const s = db.getState();
    const pr = s.privacyRequests.find(p => p.id === req.params.id);
    if (!pr) return res.status(404).json({ error: 'Request not found' });
    if (pr.status !== 'OPEN') return res.status(409).json({ error: 'Already resolved' });
    const { decision, note } = req.body || {};
    if (!['COMPLETE', 'REJECT'].includes(decision)) return res.status(400).json({ error: 'decision must be COMPLETE or REJECT' });
    if (decision === 'REJECT' && String(note || '').trim().length < 5) return res.status(400).json({ error: 'A reason is required to reject' });

    if (decision === 'COMPLETE' && pr.type === 'ERASURE') {
      const target = s.users.find(u => u.id === pr.userId);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.role === 'SUPERADMIN' || ((target.role === 'ADMIN') && !isSuper(actor))) {
        return res.status(403).json({ error: 'Administrator accounts cannot be erased by this workflow' });
      }
      const open = s.dealRooms.some(d => d.stage !== 'Settled' && (d.introducingBrokerId === target.id || d.closingBrokerId === target.id || d.ownerId === target.id));
      const crmOpen = s.crmBookings.some(b => (b.associateId === target.id || b.builderId === target.id) && b.status === 'APPROVED' && b.brokeragePaidAmount < b.brokerageAmount);
      if (open || crmOpen) return res.status(409).json({ error: 'The user has open deals or unsettled brokerage. Close them first — records needed for legal compliance are retained.' });
      // Anonymise personal data; keep the ledger rows (ids) so audit and accounting stay consistent.
      const anon = sha256(target.id).slice(0, 10);
      target.name = `Deleted user ${anon}`;
      target.email = `deleted-${anon}@erased.invalid`;
      target.phone = '';
      target.companyName = '';
      target.reraNumber = '';
      target.panNumber = undefined;
      target.aadhaarLast4 = undefined; target.idConsentAt = undefined; target.idCheckedAt = undefined; target.idCheckedBy = undefined; target.idCheckNote = undefined;
      target.gstin = undefined;
      target.avatarUrl = undefined;
      target.verificationStatus = 'SUSPENDED';
      target.verificationNotes = 'Erased at the data principal\'s request (DPDP).';
      target.passwordHash = unusablePasswordHash();
      target.sessionVersion = (target.sessionVersion || 1) + 1;
      target.erasedAt = new Date().toISOString();
      purgeUserDocs(s, target.id); // property papers they uploaded or that sit on their properties: files are deleted from the server
      purgeUserPhotos(s, target.id); // v36: the profile photo
      purgeUserIdDocs(s, target.id); // v19: PAN / Aadhaar scans and the ID-review task
      purgeKyc(s, target.id); // v25: the encrypted full Aadhaar + address
      target.autoVerifiedAt = undefined; target.autoVerifiedBy = undefined;
      for (const a of s.tier2Applications) if (a.userId === target.id) { a.panNumber = undefined; a.aadhaarLast4 = undefined; a.companyName = undefined; } // what the sponsor typed about this person
      // v60 — his Rent desk: the owners' and tenants' names and numbers he kept for his own work go with him
      s.tenancies = (s.tenancies || []).filter(t => t.brokerId !== target.id);
      for (const cr of s.clientRooms || []) if (cr.brokerId === target.id) cr.phoneSealed = undefined; // v63 — the clients' saved mobiles go with the broker's account
      // v61 — builder ↔ partner chat: his name on his messages becomes the anonymous one; photos he sent are deleted
      const gone = new Set((s.workPhotos || []).filter(p => p.byId === target.id).map(p => p.id));
      for (const id of gone) erasePhoto(id);
      for (const t of s.partnerThreads || []) for (const m of t.messages) {
        if (m.byId === target.id) m.byName = target.name;
        if (m.card?.kind === 'PHOTO' && gone.has(m.card.refId)) { m.card = undefined; m.text = m.text || '(photo removed)'; }
      }
    }
    pr.status = decision === 'COMPLETE' ? 'COMPLETED' : 'REJECTED';
    pr.resolvedAt = new Date().toISOString();
    pr.resolvedBy = actor.id;
    pr.resolutionNote = String(note || '').slice(0, 500);
    db.save();
    db.appendAuditEvent(actor.id, actor.role, 'SYSTEM', pr.id, 'PRIVACY_REQUEST_RESOLVED', `${pr.type} request ${pr.status.toLowerCase()} for ${pr.userId}`);
    res.json({ success: true, request: pr });
  });

  return r;
}
