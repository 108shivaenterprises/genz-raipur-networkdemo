# v25 — KYC vault + card photo se bharna (OCR)

Krishna ki maang: (1) card ki photo se PAN / Aadhaar / address phone par padhna (option 3), (2) PAN, poora Aadhaar aur address GENZ ke legal kaam ke liye store karna.

## 1. KYC vault
- Alag collection `kycVault` (user object par kabhi nahi). Aadhaar aur address AES-256-GCM se sealed; har value ka naya IV, AAD = `KYC-<userId>|aadhaar` / `|address`. Format `k1.<keyId>.<iv>.<tag>.<ct>`.
- Key: env `KYC_VAULT_KEY` (64 hex). Khali ho to `data/.kyc-vault.key` (0600) banti hai. **Production me env set karo aur key ka alag backup rakho** — key khoyi to data kabhi nahi khulega. Kharab key = vault band, koi kamzor fallback nahi.
- Store tabhi hota hai jab member ne tick kiya ho aur superadmin ka switch ON ho. Sirf BROKER ka vault banta hai. Address optional hai.
- Kholna: sirf SUPERADMIN (`kyc:reveal`) — purpose + 15+ akshar karan + apna password. Audit me karan aur masked Aadhaar (number nahi). Member ko 'mera KYC kisne dekha' dikhta hai. Jawab `no-store`, 90 sec baad screen se hat jata hai.
- Hatana: member khud (open dispute ho to nahi), DPDP erasure, aur sweep (REJECTED 14 din se zyada / gayab user). Suspended / blacklisted ka vault rehta hai.
- Privacy policy (hi+en) badli: ab 'Aadhaar collect nahi karte' nahi likha. POLICY_VERSION 2026-10-17.

## 2. Photo se bharna (OCR)
- Tesseract.js 7.0.0 (Apache-2.0), English; files `public/ocr/` me apne server se. Photo phone par padhi jaati hai, upload nahi.
- Do page-layout mode (block + sparse) padhe jaate hain aur jod diye jaate hain; pehli padhai jeetti hai, doosri gaps bharti hai. Kuch na mile to plain grey try hota hai.
- Aadhaar tabhi maana jaata hai jab Verhoeff checksum pass ho; 16 ank ka VID alag; masked card se sirf last 4. PAN me 0/O, 1/I jaise galat akshar position se sudhre jaate hain, par pincode ('Chhattisgarh 492004') se galat PAN nahi banta.
- Result sirf suggestion; member badal ke 'Use these' dabata hai.
- CSP: `img-src` me `blob:`, `script-src` me `wasm-unsafe-eval`, `worker-src 'self'` (v24 ke scan preview bhi ab production me chalte hain). Service worker `/ocr/` cache nahi karta.

## 3. Kanooni jokhim (zaroori)
Aadhaar Act / UIDAI poora Aadhaar number store karne par pabandi lagate hain. **Live karne se pehle advocate se confirm karein.** Superadmin ke paas vault band karne ka kill-switch hai.

## 4. Jo nahi hua
OCR option 1 (searchable PDF) aur 2 (general form-filling) nahi kiye. OCR sirf English; asli card photos par test nahi, synthetic cards par hua.

## Tests
`tests/v25-kyc-vault.test.ts` — 40 tests. Poori suite: 689 pass.
