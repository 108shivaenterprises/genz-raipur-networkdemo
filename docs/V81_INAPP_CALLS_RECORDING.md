# V81 — App ke andar awaaz wali call · number chhupa · consent wali recording

Aapki baat: "app ke andar hi call ho, number chhupana ho to broker/builder apne staff se chhupa sakein, aur call recording bhi app mein hi."

## Kya bana
Browser se browser (WebRTC) awaaz wali call. GENZ sirf dono phone ko milata hai aur call ka record rakhta hai — **number kahin bhejta, dikhata ya maangta nahi.**

| Kaun kisse | Kahan se | Shart |
|---|---|---|
| Employer ↔ apna staff, staff ↔ staff (ek hi employer) | Team list ka **Call** · staff Home ka **Call** | dono VERIFIED |
| Deal room ke log (broker, broker ka allot kiya staff) | Chats → deal chat ke upar **Call** | dono usi room mein |
| Builder ↔ uska partner broker | Partner chat ke upar **Call** | project se jude (invite/apply/appoint) |

- Samne wale ko **phone alert** jaata hai + app khula ho to **ring** (har 5 second poll). Ek hi call ek samay; doosra call ho to "busy".
- Call 45 second mein na uthe to **missed**; 60 minute se lambi call apne-aap band.
- Owner, buyer, admin ke paas call tool nahi (`call:use` sirf broker, builder aur unka staff).
- **Number chhupana:** in-app call mein number hai hi nahi. Staff ka `phoneMode = HIDDEN` pehle se hai — ab wo bhi kaam kar sakta hai bina number ke.

## Recording — kabhi chhupi nahi
| Mauka | Niyam |
|---|---|
| Employer ↔ apna staff | Employer tay karta hai: **Recording nahi / Har baar pooch kar / Hamesha (mere saath ki call)**. Default: pooch kar. |
| Do alag business (deal room, builder ↔ partner) | Hamesha **pooch kar**: ek maange, doosra **Allow** dabaye. Employer ne staff ke liye "nahi" rakha ho to maang bhi nahi sakte. |
| Hamesha (sirf apne staff ke saath) | Pehle second se record; dono screen par **laal patti** "yeh call record ho rahi hai". |

- Jisne maanga, **usi ka phone record karta hai** (dono ki awaaz mix karke, 24 kbps) aur ~45 second mein ek tukda server ko bhejta hai (Vercel body limit ke andar). Call khatam hote hi tukde jud kar ek file banti hai.
- Ek baar roki gayi recording dobara shuru nahi hoti. Ek call mein maangna max 3 baar.
- **Sunna:** business wale (broker/builder jo call mein the) aur jis staff ki call thi uska **employer**. **Staff khud audio nahi sunta / nahi pata.** GENZ admin bhi nahi.
- **30 din** baad audio apne-aap mit jaata hai; call mein shamil business apne haath se pehle bhi mita sakte hain. Account erase par us insaan ki recordings mit jaati hain.
- Har kaam audit trail mein: call start, answer, record maanga/allow/mana/roka, audio khola, audio mitaya.

## Screens
- **Call screen:** naam, timer, mute, end, "no phone number shown", record maangne / Allow / Not now.
- **Aati call:** upar ki sheet — uthao / kaato; awaaz + vibration.
- **Calls log:** Chats ke upar **Calls** button (sabke liye) aur Team → Activity (employer ke liye, saath mein **"Calls with my staff"** switch: on/off + recording niyam). Har line: kaun, kitni der, missed/declined, "recorded", **Listen** / delete (sirf unko jo sun sakte hain).

## Technical
- `src/shared/callRules.ts` (niyam), `server/calls.ts` (`/api/calls`), `server/callsig.ts` (signals), `server/pgstore.ts` (signal table), `src/components/calls/` (CallScreen, CallHost, CallButton, CallsPanel).
- **Vercel + Supabase par signals alag table `genz_call_signals` mein** (document store ke bahar) — warna har call ke sainkdon signals se poori DB baar-baar reload hoti. Ek normal server par memory mein.
- `db.calls`, `db.callSettings`; recording `data/callrec/` (file-sync se DB mein; 11 MB tak).
- **Do purani rukawatein hatani padi:** (1) `Permissions-Policy` mein `microphone=()` tha — ab `microphone=(self)` (test mein pakda gaya); (2) CSRF guard sirf JSON maanta tha — ab sirf `POST /api/calls/:id/chunk` par `audio/webm|mp4|ogg` allowed (Origin + cookie check wahi).
- **TURN relay (zaroori ho sakta hai):** India ke mobile network (CGNAT) par kai baar seedha jodna fail hota hai. Environment mein `TURN_URLS` (comma se), `TURN_USERNAME`, `TURN_CREDENTIAL` lagayein; bina inke sirf Google STUN chalta hai aur owner ke Calls panel mein peela note dikhta hai.
- Privacy: export mein call log (audio nahi), erase par recordings + naam hata.

## Test
- `v81-call-rules` (5), `v81-calls-server` (13: kaun kisse, ring/answer/busy, signals sirf doosre phone ko, ASK/ALWAYS/OFF, sirf recorder chunk bhejta hai, audio sirf employer ko, staff/admin/anjaan ko nahi, delete, log mein number nahi), `v81-calls-ui` (9).
- **Asli do-browser test (Chromium, nakli mic):** staff ne call ki → employer ke phone par ring → answer → dono taraf awaaz (inbound audio bytes > 0) → recording maangi → Allow → dono screen par laal patti → call khatam → recording save (webm/opus, awaaz maujood) → employer ko "Listen", staff ko nahi.

## Imaandari wali baatein (abhi kya nahi)
- **Kisi ke seedhe phone number par call nahi** (CRM lead / client). Uske liye telephone company ki paid service (Exotel jaisi) chahiye — alag faisla. Abhi un leads par normal "Call" (dialer) jaisa pehle tha.
- **Client Room mein client se call** (bina login) — agla kadam (client page mein bhi yahi call JS jodna). Iske baad staff bina number ke client se baat kar payega.
- **iPhone/PWA:** app band ho to ring sirf push alert se; call ke beech app background mein jaaye to awaaz ruk sakti hai (browser ki sima).
- Asli phone/mobile network par test baaki hai — upar ka test laptop par dono browser se hua; TURN ke bina kuch networks par fail ho sakta hai.
- Recording sirf wahi phone karta hai jisne maanga; uski net/battery ruke to us hisse ki recording nahi bachti (jo tukde bhej diye, wahi bachte hain).
- Recording ke kanooni niyam (consent ka shabd, kitne din rakhna) aapke vakil se confirm karein.
