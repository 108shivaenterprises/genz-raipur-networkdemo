/**
 * v31 — role home extras.   GET /api/home/insights
 * One small, role-shaped summary per signed-in member, so the home of an owner, legal counsel, builder, contractor, connector or
 * GENZ admin shows what that person actually needs today. Counts and short lists only; every item names the screen it opens.
 */
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { activeMembership } from './billing.js';
import { pageEnquiryCount } from './publicPage.js';
import { calculatePropertyMatch } from './matching.js';

const DAY = 86400_000;
const st = () => db.getState();
const p10 = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10);

export function insightsFor(u: UserProfile): { role: string; [k: string]: unknown } {
  const s = st(); const now = Date.now();
  switch (u.role) {
    case 'PROPERTY_OWNER': {
      const mine = s.properties.filter(p => p.ownerId === u.id && !['draft'].includes(p.listingStatus)).slice(0, 20);
      const openNeeds = s.requirements.filter(r => ['active', 'matching'].includes(String(r.status)));
      return {
        role: u.role,
        listings: mine.map(p => {
          const visits = s.siteVisits.filter(v => v.propertyId === p.id);
          const views = s.shareLinks.filter(l => l.kind === 'PROPERTY' && l.refId === p.id).reduce((n, l) => n + (l.views || 0), 0);
          return {
            id: p.id, title: p.title, status: p.listingStatus, askingPrice: p.askingPrice,
            views, enquiries: s.posterEnquiries.filter(e => e.propertyId === p.id).length + pageEnquiryCount(p.id),
            visits: visits.length, verifiedVisits: visits.filter(v => v.isVerified).length,
            offers: s.propertyOffers.filter(o => o.propertyId === p.id).length,
            days: Math.max(0, Math.floor((now - Date.parse(p.createdAt)) / DAY)),
            canMarkSold: ['active', 'under_negotiation'].includes(p.listingStatus),
            // v56 — how many buyers / renters on GENZ want a home like this (a count only: no names, no numbers, no broker)
            demand: ['active', 'under_negotiation'].includes(p.listingStatus) ? openNeeds.filter(r => calculatePropertyMatch(p, r).score >= 50).length : 0,
          };
        }),
      };
    }
    case 'BUYER_TENANT': {
      const ph = p10(u.phone);
      const visits = ph ? s.siteVisits.filter(v => p10(v.customerPhone) === ph).sort((a, b) => b.scheduledTime.localeCompare(a.scheduledTime)).slice(0, 10) : [];
      return {
        role: u.role,
        visits: visits.map(v => ({ id: v.id, propertyId: v.propertyId, title: s.properties.find(p => p.id === v.propertyId)?.title || v.propertyId, at: v.scheduledTime, verified: v.isVerified })),
        needs: s.requirements.filter(r => r.buyerId === u.id).length,
        // v56 — the homes I saved (public facts only)
        saved: (s.savedProperties || []).filter(x => x.userId === u.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10).map(x => {
          const p = s.properties.find(q => q.id === x.propertyId);
          return p ? { id: p.id, title: p.title, locality: p.locality, city: p.city, askingPrice: p.askingPrice, transactionType: p.transactionType, image: (p.images || [])[0], available: ['active', 'under_negotiation'].includes(p.listingStatus) } : null;
        }).filter(Boolean),
      };
    }
    case 'LEGAL_COUNSEL': {
      const cases = s.legalRequests.filter(c => c.counsellorId === u.id);
      const m = activeMembership(u.id);
      const left = m?.validTo ? Math.ceil((Date.parse(m.validTo) - now) / DAY) : null;
      return {
        role: u.role,
        cases: { claimed: cases.filter(c => c.status === 'CLAIMED').length, quoted: cases.filter(c => c.status === 'QUOTED').length, accepted: cases.filter(c => c.status === 'ACCEPTED').length, completed: cases.filter(c => c.status === 'COMPLETED').length },
        open: s.legalRequests.filter(c => c.status === 'OPEN' && !c.passedBy.includes(u.id)).length,
        membership: { active: !!m, validTo: m?.validTo || null, daysLeft: left, warn: left === null ? true : left <= 15 },
      };
    }
    case 'DEVELOPER_BUILDER': {
      const week = now - 7 * DAY; const month = now - 30 * DAY;
      const leads = s.crmLeads.filter(l => l.builderId === u.id);
      const byBroker = new Map<string, { name: string; n: number }>();
      for (const l of leads) if (l.associateId && Date.parse(l.createdAt) >= month) { const x = byBroker.get(l.associateId) || { name: l.associateName, n: 0 }; x.n++; byBroker.set(l.associateId, x); }
      const top = [...byBroker.values()].sort((a, b) => b.n - a.n)[0];
      return {
        role: u.role,
        week: {
          leads: leads.filter(l => Date.parse(l.createdAt) >= week).length,
          visits: leads.filter(l => ['SITE_VISIT_SCHEDULED', 'SITE_VISITED'].includes(l.stage) && Date.parse(l.createdAt) >= week - 7 * DAY).length,
          bookings: s.crmBookings.filter(b => b.builderId === u.id && Date.parse(b.createdAt) >= week).length,
        },
        topBroker: top ? { name: top.name, leads: top.n } : null,
      };
    }
    case 'CONTRACTOR': {
      const jobs = s.constructionLeads.filter(l => l.assignedContractorId === u.id);
      const reqs = s.contractorRequests.filter(r => r.contractorId === u.id);
      return {
        role: u.role,
        jobs: { active: jobs.filter(j => ['ASSIGNED', 'IN_PROGRESS'].includes(j.status)).length, completed: jobs.filter(j => j.status === 'COMPLETED').length },
        requests: { waiting: reqs.filter(r => r.status === 'REQUESTED').length, approved: reqs.filter(r => r.status === 'APPROVED').length, rejected: reqs.filter(r => r.status === 'REJECTED').length },
        openLeads: s.constructionLeads.filter(l => l.status === 'OPEN').length,
      };
    }
    case 'GENZ_CONNECTOR': {
      const mine = s.connectorReferrals.filter(r => r.connectorId === u.id);
      return {
        role: u.role,
        referrals: mine.length, won: mine.filter(r => r.status === 'CLOSED_WON').length,
        rewardEarned: mine.filter(r => r.rewardStatus === 'APPROVED' || r.rewardStatus === 'PAID').reduce((t, r) => t + (r.rewardAmount || 0), 0),
        shareAsks: mine.filter(r => r.share?.status === 'PROPOSED' && r.share.proposedBy === 'WORKER').length,
        shareToConfirm: mine.filter(r => r.share?.status === 'PAID').length,
      };
    }
    case 'ADMIN':
    case 'SUPERADMIN': {
      const open = ['OPEN', 'UNDER_REVIEW', 'MEDIATION'];
      return {
        role: u.role,
        items: [
          { id: 'idreview', n: s.idReviewTasks.filter(t => t.status === 'OPEN').length, tab: 'idreview', en: 'ID reviews waiting', hi: 'ID जाँच बाकी' },
          { id: 'kyc', n: s.users.filter(x => x.verificationStatus === 'PENDING' && !['ADMIN', 'SUPERADMIN'].includes(x.role)).length, tab: 'onboarding', en: 'Members waiting for verification', hi: 'वेरिफ़िकेशन के इंतज़ार में सदस्य' },
          { id: 'listings', n: s.properties.filter(p => p.verificationStatus === 'PENDING').length, tab: 'properties', en: 'Listings waiting for verification', hi: 'वेरिफ़िकेशन के इंतज़ार में लिस्टिंग' },
          { id: 'disputes', n: s.disputes.filter(d => open.includes(d.status)).length, tab: 'disputes', en: 'Open disputes', hi: 'खुले विवाद' },
          { id: 'utr', n: s.billingLedger.filter(e => e.status === 'MARKED_PAID').length + s.legalLedger.filter(e => e.status === 'MARKED_PAID').length, tab: 'plans', en: 'Payments to confirm (UTR)', hi: 'पेमेंट कन्फ़र्म करने हैं (UTR)' },
          { id: 'consents', n: s.ownerConsents.filter(c => c.status === 'PAPER_REVIEW' || (c.status === 'PENDING' && now - Date.parse(c.createdAt || c.linkExpiresAt || new Date(now).toISOString()) > 3 * DAY) || !!c.ownerReport).length, tab: 'disputes', en: 'Owner consents stuck or reported', hi: 'अटकी या शिकायत वाली मालिक सहमति' },
          { id: 'shares', n: s.connectorReferrals.filter(r => r.share?.status === 'NOT_RECEIVED').length, tab: 'connector', en: 'Connector shares “not received”', hi: 'कनेक्टर हिस्सा “नहीं मिला”' },
        ],
      };
    }
    default:
      return { role: u.role };
  }
}
