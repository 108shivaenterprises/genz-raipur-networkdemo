GENZ — on-device OCR files (v25)

These files let a member's PHONE read the numbers on a PAN / Aadhaar photo. Nothing is sent anywhere: the photo is read in the browser
and the pictures are not uploaded by this step. They are served from this server so the app never depends on a public CDN.

  worker.min.js                       tesseract.js 7.0.0         (Apache-2.0)  https://github.com/naptha/tesseract.js
  tesseract-core-lstm.wasm.js         tesseract.js-core 7.0.0    (Apache-2.0)  https://github.com/naptha/tesseract.js-core (Tesseract OCR compiled to WebAssembly)
  tesseract-core-simd-lstm.wasm.js    tesseract.js-core 7.0.0    (Apache-2.0)  same, for phones with SIMD (almost all)
  lang/eng.traineddata.gz             tessdata_best (integer) English model  (Apache-2.0)  via @tesseract.js-data/eng 1.0.0

English only on purpose: the numbers (PAN, Aadhaar, PIN) and the English line of an address are what is read; a Hindi model is much larger and
less accurate on cards. Whatever is read is only a SUGGESTION — the member sees it in editable boxes and confirms it.

To update: npm install tesseract.js@<version>, then copy the same files again (see docs/V25_KYC_VAULT_OCR.md) — the version in
package.json and the files here must match (tests/v25-kyc-vault.test.ts checks it).
