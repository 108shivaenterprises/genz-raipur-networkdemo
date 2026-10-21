# v24 — Photo se PDF (har document upload par)

Jahan bhi app me document upload hota hai, ab do raaste hain: **pehle se bani file chuno**, ya **pages ki photo kheench kar wahin ek PDF banao**.

## Kahan-kahan
| Jagah | Kya mila | Size limit |
|---|---|---|
| Property Papers → Add papers | "Make one PDF from page photos" | 10 MB, 30 pages |
| Due Diligence → evidence upload | "No PDF? Make one from photos of the pages" | 10 MB, 30 pages |
| ID copies (PAN / masked Aadhaar) — invite, sign-up, profile | "Photo → PDF" | 3 MB, 2 pages (aage + peeche) |
| Protected Docs | "Take a photo of the next page" (camera seedha) | pehle jaisa, 12 pages (ye pages ki photo hi rakhta hai) |

## Scanner screen
- **Take photo** (phone ka pichhla camera seedha khulta hai) ya **gallery se** kai photo ek saath.
- Har page: **ghumao** (90°), **aage / peeche karo**, **hatao**; page number dikhta hai.
- **Clean document look** (default ON): grey, background safed, likhai gehri — sasta "scanner" effect, koi AI / OCR nahi.
- PDF ka naam (Hindi bhi chalega); A4 page, chaudi photo ho to landscape A4.
- PDF **phone par hi banti hai** — upload dabane se pehle kuch nahi jaata.
- Size: pehle ~200 dpi; jagah ki limit se badi ho to apne aap chhoti karke dobara banti hai. Phir bhi badi ho to saaf message: "kam page wali do PDF banao".
- Aadhaar slot par upar chetavni: "sirf masked Aadhaar — photo se pehle pehle 8 ank kaagaz se dhako".

## Kaise bana (technical)
- **Koi naya library nahi.** `src/shared/pdfMaker.ts` (≈120 lines) seedha PDF likhta hai: har page par ek JPEG (/DCTDecode), koi font / script / link / form nahi. Hindi title UTF-16 me.
- `src/lib/scanPages.ts` photo ko canvas par ghumata / chhota karta / "document look" deta hai, phir JPEG.
- Bani hui PDF wahi purane upload raaste se jaati hai — server ki file-type jaanch (`%PDF-`), size limit, audit, DPDP delete sab pehle jaise.
- Jaanch: `tests/v24-scan-pdf.test.ts` (8) — PDF structure, xref offsets, koi active content nahi, **qpdf --check** aur **pdfinfo** dono pass, server PDF ko PDF hi store karta hai. Browser me 2 photo → 2-page A4 PDF ~0.4 second me, 150 KB.

## Jo nahi kiya
- **OCR** (photo se text padhna) — abhi nahi; Hindi/English OCR ke liye bada library (~10 MB) ya paid service lagti hai.
- Page ke kone khud dhoondh kar seedha karna (perspective crop) — abhi nahi; user ko seedha upar se photo lene ko kehte hain.
- Protected Docs PDF nahi banata (wo pages ki photo hi watermark ke saath dikhata hai) — wahan sirf camera button joda.
