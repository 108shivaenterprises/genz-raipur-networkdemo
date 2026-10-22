# v43 — Broker Home chhota & saaf

Phone (390px) par verified broker ka Home **7,523px se ~1,750px** ho gaya. Koi feature hataya nahi gaya, sab apni tab/More me waise hi hai.

## Kya badla
- **Ek hi greeting:** "Namaste, …" + trust badge (badge sirf phone par; desktop header me pehle se hai). Purana bada "Welcome back … India Real Estate Exchange" block broker ke liye hata.
- **Phone alerts ek baar:** "Get started" ka step dabane par hi alert card khulta hai (pehle neeche alag se bhi dikhta tha). Alert settings "My data" me bhi hain.
- **Setup bar ek baar:** "Your setup is X% done" ab tabhi dikhta hai jab 3 first steps poore hon (pehle dono progress bar saath dikhte the).
- **Co-broking offer ab tile:** pehle angrezi banner "⚡ ACTION REQUIRED: CO-BROKING SPLIT PROPOSALS" tha. Ab "किसी ब्रोकर ने को-ब्रोकिंग ऑफ़र भेजा है — जवाब दें" wala tile sabse upar hai, aur seedha Collab proposals kholta hai.
- **"+ Property (full form)"** aur **"+ Construction lead"** chhote button bade buttons ke neeche.
- **"Mera kaam ek nazar me":** 4 chhote tile (meri listing, chalu deal, deal me brokerage, construction lead), har tile clickable.
- **"Meri taaza deal":** latest 3 deal, property ka naam + stage + brokerage. Tap karte hi wahi deal room khulta hai.
- **Network activity aur charts band box me:** "दिखाएँ ▾" dabane par hi khulte hain (charts ki library bhi tabhi load hoti hai).
- **Broker home se hataye:** "Executive Administrative Oversight / Recharts", "Real Matching Engine Active", "Co-Broking Deals & Proposals" card, "Audit Log Integrity / SHA-256" card, construction pipeline card, 4 bade KPI card. Ye sab Matches / Deals / Audit / Construction tab me milte hain.
- Charts ka label sabke liye "Charts" (pehle "Executive Administrative Oversight · Visual metrics powered by Recharts").

Unverified broker, owner, buyer, builder, admin ki home pehle jaisi hai.

Files: `src/components/BrokerHome.tsx`, `src/components/DashboardView.tsx` (`lite` branch, `chartsBlock`), `src/components/GrowthNudge.tsx` (`className`), `src/App.tsx`.
