# v44 — UI aur aasaan (Deals button, chhoti property list, saral shabd)

## 1. Neeche ka "Deals" button
Pehle phone par "Deals" dabane se **Deal Desk** khulta tha (offers/token, aksar 0). Ab seedha **Deal pipeline** (saari chalu deal) khulti hai. Deal Desk "More → Deals" me hai. (`NavigationTabs.pick` ab ids ka kram maanta hai.)

## 2. Property list chhoti
- Photo ho tabhi photo; khaali "No photo yet" box hata.
- Card par sirf: ID, "Your listing", Verified/Sold, maalik approval alert, naam, prakar · ilaka · sale/rent, **keemat + area**, listed by.
- 2 main button (apni listing: **Edit + Find buyers**; doosre ki: **Co-broking offer + Find buyers**) + **"More ▾"**.
- "More ▾" me sab pehle jaisa: description, tags, owner net price, owner contact, brokerage terms, price history, map, report, Book visit, WhatsApp share, Papers, Title check.
- Owner se brokerage term par **aapka kaam baaki** ho to wo box bahar hi dikhta hai.
- Ek baar me 20 card, "और प्रॉपर्टी दिखाएँ" se 20 aur. Filters phone par 2-2 ke grid me.
- Phone par: pehle ek card ~800–1100px, ab ~260px (20 card ≈ 5,700px).

## 3. Saral shabd
| Pehle | Ab (EN / HI) |
|---|---|
| Deal Rooms & Splits / डील रूम और कमीशन | My Deals / मेरी डील |
| Property Inventory / प्रॉपर्टी इन्वेंटरी | Properties / प्रॉपर्टी |
| Due Diligence & Title Audit | Title Check / टाइटल जाँच |
| Disputes & Blacklist | Disputes / विवाद |
| Audit Trail (SHA-256) | Activity Record / गतिविधि रिकॉर्ड |
| Land Records & Red Flags | Land Records / भूमि रिकॉर्ड |
| Match Center | Matches / मैच |
| Propose Split / Propose Co-Broking Split | Co-broking offer / को-ब्रोकिंग ऑफ़र |
| Collab proposals | Offers / ऑफ़र |
| Property Inventory & Co-Broking Exchange | Properties on the network / नेटवर्क की प्रॉपर्टी |
| My Direct Mandates | My listings / मेरी लिस्टिंग |
| BUYER TENANT, DEVELOPER BUILDER… | Buyer / Tenant, Builder… |
| "India Real Estate Exchange · Signed in" | hata diya |
| Exchange Activity Feed / cryptographic audit chain | Network activity / Full activity record |

Hindi scan (broker ki 9 main screens): UI me angrezi sirf data (property naam, log, ilake) me bachi. "Today & Clients" me property ke prakar ab Hindi me.

## 4. Bug
Pehli baar app kholne wale ko galti se "Your session ended. Please sign in again." dikhta tha. Ab sirf tab dikhta hai jab koi sach me sign-in tha aur session khatam hua (Hindi me bhi).

Files: `NavigationTabs.tsx`, `PropertiesView.tsx`, `DashboardView.tsx`, `DealRoomsView.tsx`, `ActivityFeed.tsx`, `DailyView.tsx`, `MatchCenterView.tsx`, `Modals.tsx`, `LoginView.tsx`, `App.tsx`, `lib/i18n.tsx`, `lib/labels.ts`.
