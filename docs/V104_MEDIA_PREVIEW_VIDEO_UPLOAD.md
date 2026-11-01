# V104 — Chat mein photo + video preview, aur asli video upload

## 0. Kya poocha tha
1. "Property agar broker ke pass ha toh photo video preview kar sake customer bot se he hoga na yeh?" → jawab tha **poora nahi** (bot photo maangne par seedha broker ko bula leta tha; customer ke paas dekhne ki jagah nahi thi).
2. "Han kar do — video youtube se nahi, direct ka bhi option karo."
3. "Video upload ka option bhi daalo kyu ki log video jada dekhte hain."

## 1. Pehle kya tha (seedhi baat)
- Customer ka anonymous QR chat (`/q/chat/<link>`) ghar ka sirf **naam, daam, jagah** dikhata tha. Photo/video ka kuch nahi.
- "photo bhejo / video hai kya" likhne par bot ne chat **6 ghante ke liye broker ko saunp di** — chahe listing mein photo pade hon.
- App ke andar upload ki hui photo/video (`/api/owner-media/f/…`) **sirf login wale** dekh sakte the. Customer, client-room visitor, public page — kisi ko nahi dikhti thi (broken image).
- Video upload sirf **3 MB** (base64 mein, ~15–20 second ki clip). Edit screen ka "Upload Video" to data-URL banata tha jo server rejected kar deta.

## 2. Ab kya hota hai
| Jagah | Kya dikhta hai |
|---|---|
| Chat mein har ghar ke neeche | Chhota **watermarked thumbnail** + "📷/🎬 फ़ोटो / वीडियो देखें · 3 📷 · 1 🎬". Jis ghar mein kuch nahi, wahan link hi nahi. |
| `/q/chat/<link>/home/<ghar>` (naya page) | Photos (broker ka naam poori photo par + corner badge) · video: **YouTube** (embed), **direct/uploaded file** (`<video controls>`), ya koi **link** (button) · neeche "📅 विज़िट चाहिए" / "💬 ब्रोकर से बात". |
| Bot ko "photo/video?" likho | Bot har us ghar ka chip deta hai jisme media hai (`MEDIA:<id>`, "2 photos · 1 video"). Sirf jis ghar mein **kuch nahi** uske liye "🙋 फ़ोटो माँगें" → tab broker ko bulata hai. |
| Ghar sold / withdrawn | Page "बिक चुका है" bolta hai, **koi photo/video nahi**, chat card se link hat jaata hai. |
| Client room (customer ke "मेरा क्लाइंट रूम" dabane par) | Wahi **public** photos/video ke saath khulta hai (pehle khali items). |
| Broker ko | "👀 <customer>: फ़ोटो/वीडियो देखे — विज़िट पूछने का अच्छा समय है" — **har ghar ke liye ek baar**. Lead view mein `bot.viewed`. |

### Video upload
- Naya route `POST /api/owner-media/video-raw`: **file jaisi hai waisi** bheji jaati hai (base64 nahi, memory mein nahi rakhi jaati) — disk par stream hoti hai. **Progress bar** ke saath (List-property screen aur Edit screen dono).
- Format: mp4 / mov / webm. Pehle 16 bytes se asli video check hota hai (naam badalkar text file nahi chalegi). Size cap **80 MB** (`VIDEO_MAX_MB` env se badalta hai, kam se kam 5). Har user ke max 12 bade video, 20 upload/ghanta.
- Play hote waqt **Range** support hai (phone par seek/jump, poori file download kiye bina).
- **Demo copy (Vercel)** par disk nahi hai → `NO_DISK`; app apne aap purane 3 MB wale tareeke par jaata hai, bada video ho to saaf bolta hai "YouTube/Drive link daalo".

### Login ke bina dekhna — `/m/<id>`
- App ki upload ki hui photo/video ab customer ko `/m/IMG-…` / `/m/VID-…` se milti hai.
- Ye route **tabhi khula hai jab koi live, verified listing us file ko use kar rahi ho**. Ghar sold/withdrawn/hold/expire/erase hote hi band (404). Id ka format check hota hai (path-traversal nahi). Cache `private, max-age=600`, `nosniff`.
- Ghar erase (DPDP) hone par us ghar ki upload ki hui files bhi disk se hat jaati hain (agar kisi aur ghar mein use nahi ho rahi). *(Is hisse ka alag test nahi likha — code review se likha hai.)*

## 3. Kya customer ko KABHI nahi dikhta
- Vault ki **private / confidential** photo ya video, aur koi bhi **document/paper**. Sirf: listing ki apni photos + `videoUrl` + vault ki `PUBLIC` photos/walkthrough.
- Aisa ghar jo us chat mein dikhaya hi nahi gaya (page seedha `/chat` par wapas bhej deta hai). Galat link → 404.
- Owner-side chat (owner ki apni property wali chat) mein ye page nahi khulta.

## 4. Kaise chalta hai (kahan code)
- `src/shared/roomMedia.ts` → `pubMediaUrl`, `isUploadedVideo`, `videoKind` (uploaded video = FILE).
- `server/ownermedia.ts` → `serveFile` (Range), `/video-raw`, `createPublicMediaRouter()` (`/m`), `mediaIsPublic`, `eraseOwnerMediaOf`.
- `server.ts` → `/m` mount; global JSON-only guard mein `rawVideo` ka ek hi apvaad (same Origin check + cookie). *(Test ne pakda: iske bina har video upload 415 deta.)*
- `server/shopPartners.ts` → `previewMedia(h)`, chat card ka thumbnail, `GET /chat/:token/home/:homeId`, `/quick` ka `MEDIA:` redirect.
- `server/sahayak.ts` → `mediaReply`, `viewed`, chips `MEDIA` / `MEDIAREQ`, `BotDeps.media`.
- `server/clientroom.ts` / `publicPage.ts` → `pubMediaUrl` se saare outbound links; room auto-open mein public media; broker page par uploaded video `<video>` se.
- `src/lib/api.ts` `omVideoRaw` (XHR + progress), `Modals.tsx`, `EditPropertyModal.tsx` (progress bar, 80 MB hint, NO_DISK fallback).
- `public/sw.js` → `/m/` service-worker cache se bahar (range requests tootte).

## 5. Tests
`tests/v104-media-preview.test.ts` — 15: pure rules · upload (401 / galat type / text-as-video / chhota / cap se bada 413 / theek 200) · Range 206/416/HEAD · `/m` pehle band, listing live hone par khula · chat thumbnail · bot chips (broker nahi bulaya) · MEDIA tap redirect · YouTube page · uploaded-video page · khali ghar + `MEDIAREQ` ⇒ broker bulaya · doosre ghar/galat id/galat link · broker ko ek baar · client room mein `/m/` media · sold ghar par sab band.

## 6. Seemayein (jo nahi hai, seedha bol rahe hain)
1. **Bada upload sirf us server par jahan disk ho** (Docker / VM). Vercel demo par sirf ≤3 MB clip ya link.
2. Video par **watermark nahi** aur **transcode/compress nahi** — jo file di wahi chalegi. Photos par broker ka naam hai, video par nahi. Phone ka 4K video 80 MB se bada ho sakta hai → use 720p / chhota karna padega.
3. `fileSync` (shared-DB mode) **12 MB se badi file sync nahi karta** — us mode mein bade video ek hi server par rahenge.
4. Photo ka watermark customer ko ek baar copy-forward hone par bhi *kiska hai* batata hai; screen-record rokne ka koi tareeka nahi.
5. "Customer ne dekha" sirf **page khulne** ka signal hai (video play hua ya nahi — track nahi).

## 7. "Isse broker ko fida hoga? Deal jaldi close hogi?"
**Seedha jawab: maanta hoon ki hona chahiye, par isse saabit nahi kar sakta.** Hamare paas koi data nahi hai ki photo/video preview se deal tez band hoti hai. Jo pakka hai:
- Pehle customer ko photo ke liye broker ka intezaar karna padta tha (6 ghante chup bot). Ab turant dikhta hai — broker ka ek kaam kam.
- Broker ko ab ek **asli signal** milta hai ("is customer ne is ghar ki photo/video kholi") — visit pooochne ka sahi waqt.
- Isko naapne ke liye agla step: "photo kholi → visit maangi" ka ratio. Abhi wo number track nahi hota.
