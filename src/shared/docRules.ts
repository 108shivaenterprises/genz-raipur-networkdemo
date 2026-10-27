/**
 * v77 — project papers (brochure, price list, payment plan, layout…) and how far each one may travel.
 *
 *   The BUILDER decides, per paper:
 *     who gets it     ALL_CPS = any broker who sees the project · ASSOCIATES = his appointed partners · SELECTED = only the partners he names (personally)
 *     how far it goes NONE = the partner alone · TEAM = the partner may show it to his own team · CLIENT = his team may also send it to clients / customers
 *   The BROKER decides, per post, whether (and to whom) a paper goes to his team, and whether that post lets the team send it on to clients.
 *
 * The builder's choice is a ceiling that is checked every time a paper is opened or a client link is viewed, so lowering it (or ending
 * the partnership, or deleting the paper) stops the next open at once. Pure rules — no server imports.
 */
export type DocAudience = 'ASSOCIATES' | 'ALL_CPS' | 'SELECTED';
export type PassOn = 'NONE' | 'TEAM' | 'CLIENT';
export type Relation = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | string;

export const PASS_ON: { id: PassOn; en: string; hi: string; hintEn: string; hintHi: string }[] = [
  { id: 'NONE', en: 'Only the partner', hi: 'सिर्फ़ पार्टनर', hintEn: 'For the partner alone — not for his team or clients.', hintHi: 'सिर्फ़ पार्टनर के लिए — उसकी टीम या क्लाइंट के लिए नहीं।' },
  { id: 'TEAM', en: 'Partner may show his team', hi: 'पार्टनर अपनी टीम को दिखा सकता है', hintEn: 'His team can read it, but cannot send it to customers.', hintHi: 'उसकी टीम पढ़ सकती है, पर ग्राहक को भेज नहीं सकती।' },
  { id: 'CLIENT', en: 'Team may send to clients', hi: 'टीम क्लाइंट को भेज सकती है', hintEn: 'His team may show or send it to clients and customers (a tracked page).', hintHi: 'उसकी टीम क्लाइंट और ग्राहक को दिखा या भेज सकती है (ट्रैक होने वाला पेज)।' },
];
export const AUDIENCES: { id: DocAudience; en: string; hi: string }[] = [
  { id: 'ASSOCIATES', en: 'My partners', hi: 'मेरे पार्टनर' },
  { id: 'ALL_CPS', en: 'All brokers', hi: 'सभी ब्रोकर' },
  { id: 'SELECTED', en: 'Chosen partners only (personal)', hi: 'सिर्फ़ चुने पार्टनर (निजी)' },
];
export const passOf = (d: { passOn?: string }): PassOn => (d.passOn === 'TEAM' || d.passOn === 'CLIENT' ? d.passOn : 'NONE');
const RANK: Record<PassOn, number> = { NONE: 0, TEAM: 1, CLIENT: 2 };
export const passAtLeast = (d: { passOn?: string }, min: PassOn) => RANK[passOf(d)] >= RANK[min];
export const MAX_DOC_PARTNERS = 200;
export const MAX_DOC_POSTS = 50;

const WORKING: Relation[] = ['ACTIVE', 'PAUSED', 'COMPLETED'];
/** may this broker (with this relation to the project) see this paper at all? */
export function docVisibleToBroker(d: { audience: string; brokerIds?: string[] }, brokerId: string, rel: Relation): boolean {
  if (d.audience === 'ALL_CPS') return true;
  if (!WORKING.includes(rel)) return false;
  if (d.audience === 'SELECTED') return !!d.brokerIds?.includes(brokerId);
  return d.audience === 'ASSOCIATES';
}
/** only a partner whose mandate is running may pass a paper on */
export const brokerMayPass = (d: { audience: string; brokerIds?: string[]; passOn?: string }, brokerId: string, rel: Relation, min: PassOn) =>
  rel === 'ACTIVE' && docVisibleToBroker(d, brokerId, rel) && passAtLeast(d, min);

export interface DocPostLike { active: boolean; docIds: string[]; memberIds: string[]; allowClient: boolean }
export const postCoversDoc = (p: DocPostLike, docId: string, memberId: string) => p.active && p.docIds.includes(docId) && (p.memberIds.length === 0 || p.memberIds.includes(memberId));

/** what the sheet-builder sent: a problem sentence, or null */
export function docInputProblem(b: { audience?: string; brokerIds?: unknown; passOn?: unknown }, partnerIds: Set<string>): string | null {
  const aud = b.audience ?? 'ASSOCIATES';
  if (!['ASSOCIATES', 'ALL_CPS', 'SELECTED'].includes(aud)) return 'Choose who gets this paper';
  if (b.passOn !== undefined && !['NONE', 'TEAM', 'CLIENT'].includes(String(b.passOn))) return 'Choose how far this paper may go';
  if (aud === 'SELECTED') {
    const ids = b.brokerIds;
    if (!Array.isArray(ids) || ids.length === 0) return 'Pick at least one partner, or choose “My partners”';
    if (ids.length > MAX_DOC_PARTNERS || ids.some(x => typeof x !== 'string')) return 'Invalid partner list';
    if ((ids as string[]).some(x => !partnerIds.has(x))) return 'Pick only your own partners of this project';
  }
  return null;
}
