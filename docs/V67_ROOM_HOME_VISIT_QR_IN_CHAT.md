# v67 — QR lead se room me ghar, aur chat ke visit card se QR pass

## 1. Client room ab batata hai kis ghar ke liye
- Shop QR par customer ne jis ghar par "I'm interested" dabaya, lead card se **"Open a client room"** dabate hi:
  - form me line dikhti hai "👍 पसंद आया: <ghar>";
  - room banate hi wo ghar room ke **Homes** me apne aap judta hai (aur note me ghar ka naam);
  - ghar judne me fail ho to room phir bhi ban jata hai, broker haath se jod sakta hai.

## 2. Visit ka QR pass chat se
- Deal chat me visit card ke neeche **"Visit QR Pass"** button (verified ho chuka ho to "Visit pass"). Dabane par wahi QR pass / check-in screen khulti hai jo Deal room me thi.
- Chats inbox se dabane par bhi deal room khulkar pass dikhta hai (`?sub=visit:SV-…`).
- Pass ka secret (OTP/QR) wahi dikhta hai jise dikhna chahiye (owner / buyer / admin; demo me broker bhi) — chat message me kuch nahi jata.

## Files
`ShopPartners.tsx`, `ClientRooms.tsx`, `ChatPlus.tsx`, `DealRoomsView.tsx`. Server me badlav nahi.
