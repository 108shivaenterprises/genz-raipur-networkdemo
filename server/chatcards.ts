/**
 * v53 — cards in the deal chat (the "+" menu).
 *
 * A card is a message that points at something instead of copying it: the property of this deal, one of its vault documents, one of its
 * photos, its location, a site visit, or the stage of the deal. The message stores only `kind` and `refId`; every reader's screen fills the
 * card in from the data THAT reader may already see (the privacy-shielded property, the vault list filtered by his grants, his own visit list).
 * So a card can never show more than the reader could open on his own — "+" is a shortcut, not a new way to share.
 *
 * `checkCard` is the one place that decides whether a sender may put such a card in this deal's chat. It is pure (no db, no request).
 */
import type { DealRoom, Property, PropertyMediaAsset, SiteVisit } from '../src/types/index.js';

export const CARD_KINDS = ['PROPERTY', 'DOCUMENT', 'PHOTO', 'LOCATION', 'VISIT', 'STAGE', 'OFFER', 'AGREEMENT'] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const isCardKind = (k: unknown): k is CardKind => typeof k === 'string' && (CARD_KINDS as readonly string[]).includes(k);

export type CardResult =
  | { ok: true; refId: string; mediaUrl?: string; auto: string }
  | { ok: false; status: number; error: string; code: string };

const CATEGORY_EN: Record<string, string> = {
  OWNERSHIP_TITLE_DEED: 'title deed', SALE_DEED_CHAIN: 'sale-deed chain', LAYOUT_SITE_PLAN: 'layout / site plan', SURVEY_MEASUREMENT: 'survey / measurement',
  TAX_RECEIPT_NOC: 'tax receipt / NOC', WALKTHROUGH_VIDEO: 'walkthrough video', OTHER_ATTACHMENT: 'attachment', PHOTOGRAPH: 'photo',
};

const bad = (status: number, code: string, error: string): CardResult => ({ ok: false, status, code, error });

export function checkCard(i: {
  kind: CardKind;
  refId?: unknown;
  mediaUrl?: unknown;
  deal: Pick<DealRoom, 'id' | 'propertyId' | 'stage'>;
  property?: Pick<Property, 'id' | 'title' | 'images'>;
  /** the vault assets THIS sender may open on this property (the same list GET /api/properties/:id/vault/assets gives him) */
  visibleAssets: Pick<PropertyMediaAsset, 'id' | 'category' | 'fileUrl'>[];
  /** the site visits of this deal room */
  visits: Pick<SiteVisit, 'id' | 'dealRoomId' | 'brokerId' | 'scheduledTime'>[];
  /** v153 — the offers made on this deal's property for this deal, and the deal's commission agreements (ids only; each reader's screen fetches what he may see) */
  offers?: { id: string; dealRoomId?: string }[];
  agreements?: { id: string; dealId: string }[];
  /** the sender is one of the two deal brokers */
  isBroker: boolean;
  userId: string;
}): CardResult {
  const { kind, deal } = i;
  const ref = typeof i.refId === 'string' ? i.refId.trim().slice(0, 120) : '';
  switch (kind) {
    case 'PROPERTY':
    case 'LOCATION': {
      if (!i.property) return bad(404, 'CARD_NOT_FOUND', 'Property not found');
      if (ref && ref !== deal.propertyId) return bad(400, 'CARD_BAD_REF', 'A deal chat can only carry the property of this deal.');
      return { ok: true, refId: deal.propertyId, auto: kind === 'PROPERTY' ? `Shared the property: ${String(i.property.title || deal.propertyId).slice(0, 120)}` : 'Shared the property location' };
    }
    case 'PHOTO': {
      if (!i.property) return bad(404, 'CARD_NOT_FOUND', 'Property not found');
      const url = typeof i.mediaUrl === 'string' ? i.mediaUrl.trim() : '';
      const mine = new Set<string>([...(i.property.images || []), ...i.visibleAssets.filter(a => a.category === 'PHOTOGRAPH').map(a => a.fileUrl)]);
      if (!url || !mine.has(url)) return bad(403, 'CARD_NOT_YOURS', 'That photo is not one you can share from this property.');
      return { ok: true, refId: deal.propertyId, mediaUrl: url, auto: 'Shared a photo' };
    }
    case 'DOCUMENT': {
      const a = i.visibleAssets.find(x => x.id === ref);
      if (!a) return bad(403, 'CARD_NOT_YOURS', 'That document is not one you can open on this property, so it cannot be shared from the chat.');
      return { ok: true, refId: a.id, auto: `Shared a document (${CATEGORY_EN[a.category] || 'document'})` };
    }
    case 'VISIT': {
      const v = i.visits.find(x => x.id === ref && x.dealRoomId === deal.id);
      if (!v) return bad(404, 'CARD_NOT_FOUND', 'That site visit is not part of this deal room.');
      if (v.brokerId !== i.userId && !i.isBroker) return bad(403, 'CARD_NOT_YOURS', 'Only the broker who set up the visit (or a deal broker) can share it.');
      const when = (() => { try { return new Date(v.scheduledTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } })();
      return { ok: true, refId: v.id, auto: `Site visit${when ? ` on ${when}` : ''}` };
    }
    case 'OFFER': {
      if (!i.isBroker) return bad(403, 'CARD_NOT_YOURS', 'Only the deal brokers can post an offer card.');
      if (!(i.offers || []).some(o => o.id === ref && o.dealRoomId === deal.id)) return bad(404, 'CARD_NOT_FOUND', 'That offer is not part of this deal.');
      return { ok: true, refId: ref, auto: 'Shared an offer' };   // no amount here: each reader's screen shows what he may see
    }
    case 'AGREEMENT': {
      if (!i.isBroker) return bad(403, 'CARD_NOT_YOURS', 'Only the deal brokers can post the agreement card.');
      if (!(i.agreements || []).some(a => a.id === ref && a.dealId === deal.id)) return bad(404, 'CARD_NOT_FOUND', 'That agreement is not part of this deal.');
      return { ok: true, refId: ref, auto: 'Shared the commission agreement' };
    }
    case 'STAGE': {
      if (!i.isBroker) return bad(403, 'CARD_NOT_YOURS', 'Only the deal brokers can post a stage card.');
      if (ref !== deal.stage) return bad(409, 'CARD_STALE', 'The deal is no longer at that stage.');
      return { ok: true, refId: deal.stage, auto: `Deal stage: ${deal.stage}` };
    }
  }
}
