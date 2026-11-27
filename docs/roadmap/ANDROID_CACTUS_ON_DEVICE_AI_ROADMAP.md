# 📱 Android Mobile App Roadmap: On-Device AI Architecture (Cactus Engine)

> **Document Type:** Future Technical Roadmap & Architecture Specification  
> **Target Release:** Mobile Native Phase (Android APK / Flutter / React Native)  
> **Core Engine:** [Cactus Compute](https://github.com/cactus-compute/cactus) (Sub-50MB On-Device Edge AI)  
> **Key Objective:** Zero-Cloud API Cost, 100% Offline Capability, Instant Voice-to-Listing & OCR for Indian Brokers.

---

## 1. 🎯 Why Cactus for GENZ Broker Network Mobile App?

Indian real estate brokers in Tier-1, Tier-2, and Tier-3 cities operate under unique field constraints:
1. **Zero Recurring Overhead:** Brokers do not want monthly API charges or subscriptions.
2. **Vernacular Voice Notes Preference:** Brokers routinely send WhatsApp voice notes in Hindi/Hinglish instead of typing lengthy descriptions.
3. **Remote Site Connectivity Drops:** Farmland, plot layouts, and outskirts often suffer from poor or zero 4G/5G reception.
4. **Data Privacy (DPDP Act Compliance):** Registry papers, Khasra Nakal, and client Aadhaar details must never leak to third-party cloud LLM providers.

**Cactus Engine** runs lightweight (<50MB) quantized speech, vision, and text models natively on the user's smartphone processor and NPU, ensuring:
- **₹0 Cloud API Bills** (No OpenAI / Anthropic / Google Cloud fees).
- **100% Offline Functionality** in remote agricultural and plot sites.
- **Ultra-Fast Local Latency** (instant transcription without network lag).

---

## 2. 🚀 Key Mobile Features to Build with Cactus

### Feature A: "Bol Kar Listing Banao" (Local Voice-to-Listing Engine)
* **User Flow:**
  1. Broker presses a mic icon in the app.
  2. Broker speaks naturally in Hindi/Hinglish:  
     *"Bhai Shankar Nagar me Royal Palms me 3 BHK flat hai, 4th floor, 1350 sqft carpet, 72 lakh demand hai, Khasra number 142/3 hai."*
  3. Cactus on-device speech-to-text transcribes the audio locally in <1.5 seconds.
  4. Cactus small language model (SLM) executes structured tool calling:
     ```json
     {
       "title": "3 BHK Flat — Royal Palms, Shankar Nagar",
       "propertyType": "Residential Flat",
       "carpetArea": 1350,
       "price": 7200000,
       "floor": "4th Floor",
       "landIdentifier": "Khasra No. 142/3"
     }
     ```
  5. The property form is auto-populated and ready to publish in one click.

### Feature B: On-Device Land Record & Registry OCR
* **User Flow:**
  1. Broker clicks a photo of a physical Khasra B-1, 7/12 Utara, or Registry page.
  2. Cactus on-device vision model extracts:
     - Seller / Owner Name
     - Khasra / Survey Number / CTS No.
     - Total Land Area (in Hectares / Acres / Sq.Ft.)
     - Diversion Order Number & Date
  3. Pre-populates the Property Verification & Legal Draft forms directly on the device.
  4. Encrypted in local SQLite without sending raw document scans over the internet.

### Feature C: Offline Sahayak Assistant (Basement & Remote Farmland Mode)
* In underground basement offices or rural areas without mobile data, the offline assistant answers:
  - Local circle rates and stamp duty calculations.
  - Vastu compliance advice for room layouts.
  - Step-by-step guidance on registry paperwork.

### Feature D: On-Device Contractor Quote & Invoice Scanner for GENZ Coins Redemption
* **User Flow:**
  1. Client or partner pastes a WhatsApp contractor quote or scans a physical bill in Hindi, Hinglish, or English (e.g., *"Asian Paints putty + 2 coat emulsion 2.5 lakh total"* or *"Modular wardrobe carpenter work 85,000"*).
  2. In the Android APK WebView, `src/lib/cactusBridge.ts` (`parseQuoteWithCactus`) detects `window.CactusNativeBridge` and invokes the bundled `cactus-compute/cactus` on-device SLM completely offline (falling back to the deterministic local parser on the web app).
  3. Cactus extracts the **Partner Category** (`Painter`, `Carpenter`, `Architect`, `Thekedar`, `Tiles`, `Cleaning`) and **Invoice Amount (INR)** (handling formats like `"2.5 lakh"`, `"85,000"`, `"1.2L"`).
  4. The app automatically maps the parsed invoice amount and category to the **GENZ Coins Discount Slab (10% / 15% / 20%)** so clients can preview and redeem their GENZ Coins discount effortlessly without cloud latency or API cost.

---

## 3. 🛠️ Technical Implementation Blueprint (Android / React Native / Flutter)

```
┌─────────────────────────────────────────────────────────────┐
│              GENZ Broker Network Android App                │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 React Native / Flutter UI           │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │ JNI / C++ Bindings           │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │              Cactus On-Device Runtime               │   │
│   │  (Runs on Mobile NPU / Snapdragon / MediaTek GPU)   │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │ • Speech-to-Text: On-device quantized Whisper      │   │
│   │ • Structured Extraction: Sub-50MB Function-calling  │   │
│   │ • Vision / OCR: Edge document scanner               │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │         Local SQLite / Encrypted Device Vault       │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Installation Target (When Starting Android Build):
- GitHub Repository: `https://github.com/cactus-compute/cactus`
- Integration Bridge: Cactus Android Native SDK / React Native TurboModule or Flutter FFI Plugin.
- Model Storage: Bundled in Android APK assets or downloaded once on first app launch over Wi-Fi.

---

## 4. 📋 Production Readiness Checklist for Android Launch

- [ ] Wrap current Vite React web app in Capacitor / React Native / Flutter container.
- [ ] Initialize Cactus C++ runtime using Android NDK bindings.
- [ ] Embed quantized Hindi/English speech transcription model (sub-40MB).
- [ ] Connect Cactus voice transcription stream to `EditPropertyModal.tsx` and `RequirementsView.tsx`.
- [ ] Connect Cactus camera OCR stream to `PropertyPapersView.tsx` and `LegalDraftModal.tsx`.
- [ ] Benchmark battery drain and memory footprint on low-cost Android test devices (Redmi, Realme, Samsung M-series).

---
*Created on November 25, 2026 • GENZ Broker Network Architectural Records*
