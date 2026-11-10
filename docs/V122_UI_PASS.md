# V122 — UI pass: sab roles, phone size (10 Nov)

## Kaise dekha
12 roles ko 390px phone par khola (broker, builder, owner, buyer, shop connector, telecaller, field agent, builder sales, builder site, contractor, legal, admin). Har home ka screenshot + ginti: page ki lambai, button, chhote button, dohraye label, side-scroll, JS error. Broker ke Needs / Deals / Shop QR / CRM bhi dekhe.
Kahin side-scroll ya JS error nahi mila.

## Kya hataya / badla
| Kya | Kyun |
|---|---|
| ⚡ floating quick button **hataya** (sab roles) | Search upar hai, Magic Match / lead / property home par hain, Deals neeche bar me. Wahi 5 cheezein teesri baar thi, aur button owner, staff, connector ke content ke upar baithta tha. |
| "Namaste, Er. 👋" → **"Namaste, Ankit 👋"** | Er. / Adv. / Dr. jaisa title naam ki jagah aa raha tha (builder, legal). |
| Buyer ka neeche ka bar: Home · Property · Needs · Magic Match | Pehle "Network Feed" aur "Profiles & Reviews" the, jo buyer ka roz ka kaam nahi. |
| Buyer home se "What next?" card **hataya** | Upar ke 4 tile wahi 3 link the. |
| Buyer home ka cost sheet + EMI form ab **band (tap se khulta)** | Home 2890px se 1701px. |
| GENZ Radar ab bina-shehar wali zaroorat bhi dikhata hai | Purani requirement me shehar nahi tha, to Radar khaali dikhta tha jabki "Network needs (2)" tha. Ab aisi zaroorat uske broker ke shehar me gini jaati hai. |
| "Vastu AI Smart Paste" → **"Smart Paste"** | Ye AI nahi, niyam se padhta hai; "Vastu AI" naam AI Studio ka bacha hua tha. |

## Jo theek mila (nahi chheda)
Broker home (2 bade button + 4 tile), builder / contractor / legal home ("aaj kya ruka hai"), staff ka "My day" + punch, connector ka Hindi home, deal pipeline, Shop QR partners.

## Jo abhi bhi kamzor hai
- Owner home lamba (2821px): stat tile + "Quick links" + neeche ka bar kuch dohrate hain.
- Admin home bahut lamba (6158px, 27 chhote button).
- GENZ Radar aur "Network needs" tab ek hi cheez do tarah se dikhate hain.
- Demo data me koi shop-QR lead nahi, isliye customer ka QR chat / client room / deal brief card is baar aankh se nahi dekha (tests se chalta hai).
