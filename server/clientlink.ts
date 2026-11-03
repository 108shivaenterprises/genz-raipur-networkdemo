/**
 * v113 — one client, three places: the broker's client list (ClientCard), the Buyers / Match need (BuyerRequirement) and the chat room.
 * Whichever one the broker adds first, the others follow, matched by the broker + the client's 10-digit mobile. The two records keep
 * budget / area / type / stage in step. A chat room is never opened for him: that needs the client's own "yes" (consent) — the card
 * only shows a Chat button once a room exists, and the screen offers to open one.
 */
import { db, type ClientCard, type BuyerRequirement } from './db.js';
import { PROPERTY_TYPES, type PropertyType } from '../src/shared/india.js';
import { normCity } from '../src/shared/cities.js';

const phone10 = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-10);
const OK_PHONE = /^[6-9]\d{9}$/;
const now = () => new Date().toISOString();
const st = () => db.getState();

const ptypeOf = (s: string): PropertyType => ((PROPERTY_TYPES as readonly string[]).includes(s) ? (s as PropertyType) : 'Residential Flat');
const cardId = (list: ClientCard[]) => `CLI-${String(list.reduce((m, c) => Math.max(m, Number(c.id.split('-').pop()) || 0), 0) + 1).padStart(4, '0')}`;
const reqId = (list: BuyerRequirement[]) => `REQ-${list.reduce((m, q) => Math.max(m, Number(/REQ-(?:RAI-)?(\d+)/.exec(q.id)?.[1] ?? 0)), 200) + 1}`;
const live = (q: BuyerRequirement) => !['fulfilled', 'closed'].includes(q.status);

/** the need that belongs to this card: by id, else the broker's own open need for the same mobile */
export function needOfCard(c: ClientCard): BuyerRequirement | undefined {
  const s = st();
  const byId = c.requirementId ? s.requirements.find(q => q.id === c.requirementId) : undefined;
  if (byId) return byId;
  const ph = phone10(c.phone); if (!OK_PHONE.test(ph)) return undefined;
  return s.requirements.find(q => q.assignedBrokerId === c.brokerId && phone10(q.customerPhone) === ph && live(q));
}

/** card → need: make it (when there is a budget to match on) or bring it in step. Returns true when something changed. */
export function linkNeedForCard(c: ClientCard): boolean {
  const s = st(); const ph = phone10(c.phone);
  if (!OK_PHONE.test(ph)) return false;
  let q = needOfCard(c); let changed = false;
  if (!q) {
    if (c.stage === 'DEAL' || c.stage === 'LOST') return false;   // shortcut: a client with no budget is listed with ₹0 so he is visible in Match, upgrade: ask for a budget
    const prior = s.requirements.find(x => phone10(x.customerPhone) === ph);
    q = {
      id: reqId(s.requirements), customerId: prior?.customerId || `CUST-${Date.now().toString(36).toUpperCase()}`, customerName: c.name, customerPhone: ph, assignedBrokerId: c.brokerId,
      budgetMin: c.budgetMin, budgetMax: c.budgetMax, city: normCity(c.city), preferredLocalities: [...c.areas], propertyType: ptypeOf(c.propertyType), transactionType: c.transactionType,
      purpose: 'Self-use', urgency: 'Moderate (1-3 months)', status: 'matching', createdAt: now(), updatedAt: now(),
    } as BuyerRequirement;
    s.requirements.unshift(q); changed = true;
  }
  if (q.clientCardId !== c.id) { q.clientCardId = c.id; changed = true; }
  if (c.requirementId !== q.id) { c.requirementId = q.id; changed = true; }
  const set = <K extends keyof BuyerRequirement>(k: K, v: BuyerRequirement[K]) => { if (JSON.stringify(q![k]) !== JSON.stringify(v)) { q![k] = v; changed = true; } };
  if (c.budgetMax > 0) { set('budgetMin', c.budgetMin); set('budgetMax', c.budgetMax); }
  set('customerName', c.name); if (c.areas.length) set('preferredLocalities', [...c.areas]); if (c.city) set('city', normCity(c.city));
  set('transactionType', c.transactionType); if ((PROPERTY_TYPES as readonly string[]).includes(c.propertyType)) set('propertyType', c.propertyType as PropertyType);
  set('status', c.stage === 'DEAL' ? 'fulfilled' : c.stage === 'LOST' ? 'closed' : q.status === 'in_deal_room' ? 'in_deal_room' : 'matching');
  if (changed) q.updatedAt = now();
  return changed;
}

/** need → card: a broker-assigned need with a real number gets a client card (and the two are linked) */
export function ensureCardForNeed(q: BuyerRequirement): boolean {
  const s = st(); const ph = phone10(q.customerPhone);
  if (!q.assignedBrokerId || !OK_PHONE.test(ph) || !live(q)) return false;
  let c = q.clientCardId ? s.clientCards.find(x => x.id === q.clientCardId) : s.clientCards.find(x => x.brokerId === q.assignedBrokerId && phone10(x.phone) === ph && x.stage !== 'LOST');
  let changed = false;
  if (!c) {
    const t = now();
    c = {
      id: cardId(s.clientCards), brokerId: q.assignedBrokerId, name: q.customerName, phone: ph, budgetMin: q.budgetMin, budgetMax: q.budgetMax, city: q.city || '', areas: [...(q.preferredLocalities || [])],
      propertyType: q.propertyType, transactionType: q.transactionType, tags: ['From Buyers'], notes: '', stage: 'NEW', consent: true,
      timeline: [{ at: t, kind: 'CREATED', text: 'Added from the Buyers list' }], createdAt: t, updatedAt: t,
    } as ClientCard;
    s.clientCards.unshift(c); changed = true;
  }
  if (q.clientCardId !== c.id) { q.clientCardId = c.id; changed = true; }
  if (c.requirementId !== q.id) { c.requirementId = q.id; changed = true; }
  return changed;
}


export function ensureCardForRoom(brokerId: string, name: string, phone: string): boolean {
  const s = st(); const ph = phone10(phone);
  if (!OK_PHONE.test(ph) || s.clientCards.some(x => x.brokerId === brokerId && phone10(x.phone) === ph && x.stage !== 'LOST')) return false;
  const t = now(); const u = s.users.find(x => x.id === brokerId);
  s.clientCards.unshift({
    id: cardId(s.clientCards), brokerId, name, phone: ph, budgetMin: 0, budgetMax: 0, city: normCity(u?.city || ''), areas: [], propertyType: 'Any', transactionType: 'Sale', tags: ['From chat'], notes: '', stage: 'NEW', consent: true,
    timeline: [{ at: t, kind: 'CREATED', text: 'Added when the client room was opened' }], createdAt: t, updatedAt: t,
  } as ClientCard);
  return true;
}

/** one broker's whole book, brought in step (cheap and idempotent: it runs when the client list opens, saves only if something moved) */
export function syncBroker(brokerId: string): number {
  const s = st(); let n = 0;
  for (const c of s.clientCards.filter(x => x.brokerId === brokerId)) if (linkNeedForCard(c)) n++;
  for (const q of s.requirements.filter(x => x.assignedBrokerId === brokerId)) if (ensureCardForNeed(q)) n++;
  if (n) db.save();
  return n;
}
