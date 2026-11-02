# V111 — Copilot phase 2 + 3: inventory, daily brief, voice

## Naya
- **Inventory Copilot** (grid ke upar, `InventoryCopilot.tsx` + `shared/invCopilot.ts`)
  - Builder: "A-101 ka rate 85 lakh karo", "A-102 reserve karo", "A-102 available karo" → confirm card → wahi `PUT /inventory/units/:uid` jo grid ki edit sheet use karti hai.
  - Partner/broker: sirf puchh sakta hai — "kitne flat bache", "A-101 ka status". Hold/booking ke liye grid par bheja jata hai (token + receipt chahiye).
  - Hold ya booked unit par bot koi plan nahi banata, wajah batata hai. 20% se bada rate-jump par chetavni.
- **Daily brief**: Today tab (broker) aur grid (builder/partner) kholte hi, din me ek baar, jis par dhyan chahiye wo list (follow-up due, thande leads / hold par units). Kuch na ho to chup.
- **Voice**: mic button (browser ka built-in speech, `VoiceNote` reuse). Bola hua text seedha plan banta hai; kaam phir bhi ✅ ke baad hi. Chrome/Edge audio browser maker ki speech service ko bhejte hain — screen par likha hai; GENZ ko sirf shabd milte hain.
- `CopilotShell.tsx` — sab roles ka common chat box (plan → confirm → API, mic, brief). Naye role ka copilot = sirf `plan/read/run` dena.

## Jaan-boojh ke nahi
- Owner ke liye alag copilot nahi: unki listing me pay/renew paisa hai — bot se nahi karwate.
- Push notification wala proactive brief nahi (abhi app khulne par dikhta hai).
- GitHub repos copy nahi kiye: koi bhi hamare inventory/CRM jitni gehri nahi mili, license verify nahi hua.
