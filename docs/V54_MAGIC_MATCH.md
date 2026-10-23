# v54 — ✨ Magic Match, aur Home thoda saaf

## 1. "Matches" ab "✨ Magic Match / मैजिक मैच"
- Naam har dikhne wali jagah badla: neeche ka menu / "More" grid, Home ka tile (ab peela, ✨ ke saath), page ka title, Control Center, buyer ke Home ka tile, purane dashboard ka button, buyer requirement ka message.
- Matching ke niyam **bilkul wahi** hain (shahar + ilaka, budget, prakar, kshetrafal). Server mein kuch nahi badla.

## 2. Magic Match ka page chhota aur saaf
Pehle har match ek bada card tha (cover photo, ID, lambi "Why this matched" list, 4 tick, price, button), aur saare match ek saath khulte the.
Ab har card mein:
- **photo** (80px, baayein), **naam**, "type · ilaka", **price**, aur upar-daayein **score** (hara / peela / grey)
- 4 jaanch chhote chip mein: ✓ Location ✓ Budget ✓ Type ✗ Area
- **"Why this match ▾"** dabane par kaaran aur ID khulte hain
- **Co-broking offer** button bada (44px)
- Ek baar mein **8 match**, phir "Show 8 more"
- Upar: "For a buyer / For a property" (bade button), aur buyer need / property ka dropdown bada
- Ginti title ke saath chip mein ("26 matches")

Naap (phone 390px, broker demo account, wahi data):
| | pehle | ab |
|---|---|---|
| Page ki lambai | 15,237px | 2,216px |
| Shabd | 2,250 | 619 |
| 12px se chhota text | 33 | 7 |
| 36px se chhote button | 5 | 0 |

## 3. Home
- **Get started:** jo step ho gaya wo ab kata hua nahi dikhta, **gayab ho jata hai**. Upar "2 of 3 done" aur progress bar waise hi.
- "Property (full form)" aur "Construction lead" button 34px se 44px.
- "My work at a glance" ke chhote label 11px se 12px; "All deals" link ab bada (pehle 16px ooncha).
- Buyer / owner jaise role jinke upar tab ki line hai: tab ab phone par 40px ooncha (pehle 32px), badi screen par pehle jaisa.
- Buyer ke Home ka kharch-calculator (stamp duty, registration, loan…) ke 10–11px label ab 12px.

Naap (Home, phone 390px):
| | pehle | ab |
|---|---|---|
| Broker: 12px se chhota text | 23 | 9 (zyadatar neeche ka menu, jo normal hai) |
| Broker: chhote button | 4 | 1 (trust badge) |
| Buyer: chhota text | 18 | 2 |
| Buyer: chhote button | 6 | 1 |

## Imaandari wali baatein
- Matches ka bada cover photo hata kar 80px ki photo lagayi (list mein zyada match ek screen par aate hain). Agar aapko bada photo hi chahiye to wapas kar sakte hain.
- Check desktop browser ko 390px chauda karke kiya; local photos test-tasveer hain.
- Hindi mein "मैजिक मैच" lagaya; poora Hindi page role-audit mein dekha jayega.
- Server / permission / data kuch nahi badla. Poora suite phir chalaya: **61 files / 894 test pass.** Manual update nahi kiya.

Files: `MatchCenterView.tsx` (naya roop), `BrokerHome.tsx`, `DashboardView.tsx`, `RoleHome.tsx`, `NavigationTabs.tsx`, `CostSheet.tsx`, `ControlCenter.tsx`, `RequirementsView.tsx`, `Modals.tsx`, `src/lib/i18n.tsx`.
