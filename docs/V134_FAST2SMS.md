# V134 — Fast2SMS se seedha SMS / OTP

## Kya hua
- App ab **Fast2SMS** se SMS bhej sakta hai. Code me sirf `server/notify.ts` badla (ek chhota `fast2sms()` sender) aur jahan bhi app dekhta tha "SMS chalu hai?" wahan ek hi check `smsGateway()` laga.
- Ye flow ab asli SMS se chalenge: dukaandaar ka page, client room, QR chat me wapas aana, visit par client ki haan (visit ack), owner ki sahmati, owner listing sign code, visit / mandate ki khabar.
- **Key kabhi code ya git me nahi.** Sirf Vercel env me. Log me message nahi likha jaata (usme code ho sakta hai), sirf Fast2SMS ka error.

## Vercel env (aapko daalna hai)
| Naam | Zaroori? | Kya |
|---|---|---|
| `FAST2SMS_API_KEY` | haan | Fast2SMS → Dev API ki key |
| `FAST2SMS_OTP_ID` | launch ke liye haan | Fast2SMS → Smart OTP / OTP template ka id |

## Kaun sa raasta
- **`FAST2SMS_OTP_ID` hai:** 6 ank ka code wale SMS **OTP API** (`/dev/otp/send`) se jaate hain, hamara apna code (`otp`) aur 10 minute expiry ke saath. Baaki SMS (reminder, khabar) Quick SMS se.
- **`FAST2SMS_OTP_ID` nahi hai:** sab **Quick SMS** (`route: q`) se. DLT ki zaroorat nahi, par Fast2SMS ke page ke mutabik ₹5–7 prati SMS aur message unki team **manually approve** karti hai, isliye OTP der se pahunch sakta hai. Sirf test ke liye theek.
- Fast2SMS chalu ho to **Firebase OTP page apne aap band** (warna phone par do code aate). `SMS_WEBHOOK_URL` sabse upar, phir Fast2SMS, phir Firebase.

## Tests
- `tests/v134-fast2sms.test.ts` (4): OTP API me apna code aur key sirf header me; OTP id ke bina / bina code wala message Quick SMS; videshi number nahi jaata, error log me code nahi; Fast2SMS chalu → Firebase band.

## Jo nahi dekha
- Asli Fast2SMS par SMS nahi bheja. Aapki key se maine koi call nahi kiya; test me fetch nakli tha.
- Bina code wale SMS (visit book hone ki khabar customer + owner ko, mandate ki khabar broker ko, visit-ack link, dukaandaar ko "baat aage badhi?") bhi Quick SMS se jayenge, yaani ₹5–7 har ek.
- Fast2SMS ka DLT / Smart OTP template kaise banta hai, ye unke panel par hai; maine sirf API docs padhe.
