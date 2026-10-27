/**
 * v80 — Magic Match: what a card may offer ME, by whose home and whose buyer it is.
 *
 *   my home  + my buyer         → nobody to co-broke with: open a client room
 *   my home  + another's buyer  → the offer goes to THAT buyer's broker
 *   another's home + my buyer   → the offer goes to the broker who lists the home
 *   neither is mine             → not my deal: no button (before v80 such a card offered the deal to the listing broker,
 *                                  and for my own home that "listing broker" was ME — the server answered
 *                                  "You cannot propose a collaboration to yourself")
 */
export type MatchAction = { kind: 'OWN' } | { kind: 'OFFER'; to: string } | { kind: 'NONE' };

export function matchAction(meId: string | undefined, propBrokerId: string | undefined, reqBrokerId: string | undefined): MatchAction {
  if (!meId) return { kind: 'NONE' };
  const mineHome = !!propBrokerId && propBrokerId === meId;
  const mineBuyer = !!reqBrokerId && reqBrokerId === meId;
  if (mineHome && mineBuyer) return { kind: 'OWN' };
  if (mineHome && reqBrokerId) return { kind: 'OFFER', to: reqBrokerId };
  if (mineBuyer && propBrokerId) return { kind: 'OFFER', to: propBrokerId };
  return { kind: 'NONE' };
}

/** put what is mine first (a stable sort), so the screen starts on my own buyer / my own home, not on somebody's */
export function mineFirst<T>(list: readonly T[], isMine: (x: T) => boolean): T[] {
  return [...list.filter(isMine), ...list.filter(x => !isMine(x))];
}
