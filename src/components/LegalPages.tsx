import React, { useEffect, useState } from 'react';
import { useI18n, LangToggle } from '../lib/i18n.js';

// Set VITE_LEGAL_JURISDICTION / VITE_LEGAL_JURISDICTION_HI at build time to the operator's registered place of business.
const JURISDICTION: string = (import.meta as any).env?.VITE_LEGAL_JURISDICTION || "the operator's registered place of business in India";
const JURISDICTION_HI: string = (import.meta as any).env?.VITE_LEGAL_JURISDICTION_HI || 'ऑपरेटर के पंजीकृत कार्यस्थल';

interface LegalCfg { policyVersion: string; company: string; address: string; retentionNote: string; grievanceOfficer: { name: string; email: string; phone: string; responseDays: number } }

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-6"><h2 className="text-sm font-bold text-slate-900">{title}</h2><div className="mt-1 space-y-2 text-sm leading-relaxed text-slate-700">{children}</div></section>
);

export const LegalPage: React.FC<{ kind: 'privacy' | 'terms' }> = ({ kind }) => {
  const { lang } = useI18n();
  const [cfg, setCfg] = useState<LegalCfg | null>(null);
  useEffect(() => { fetch('/api/legal/config').then(r => r.json()).then(setCfg).catch(() => {}); }, []);
  const hi = lang === 'hi';
  const go = (h: string) => { window.location.hash = h; };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => { window.location.hash = ''; }} className="text-xs font-semibold text-slate-600 hover:text-slate-900">← {hi ? 'वापस' : 'Back'}</button>
          <LangToggle />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">
          {kind === 'privacy' ? (hi ? 'प्राइवेसी पॉलिसी' : 'Privacy Policy') : (hi ? 'नियम और शर्तें' : 'Terms of Use')}
        </h1>
        <p className="text-xs text-slate-500">{cfg?.company} · v{cfg?.policyVersion}</p>
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          {hi ? 'यह टेम्पलेट है; लॉन्च से पहले अपने वकील से समीक्षा कराएँ।' : 'Template text — have your counsel review it before public launch.'}
        </p>

        {kind === 'privacy' ? (
          <>
            <Section title={hi ? '1. हम कौन सा डेटा लेते हैं' : '1. What we collect'}>
              <p>{hi ? 'नाम, मोबाइल, ईमेल, कंपनी, RERA नंबर, PAN/GSTIN (केवल KYC के लिए), प्रॉपर्टी और डील की जानकारी, साइट-विज़िट रिकॉर्ड, और सुरक्षा के लिए लॉगिन/ऑडिट लॉग। ब्रोकर से PAN, आधार नंबर और पता भी लिया जाता है — आपकी सहमति से, आधार नंबर और पता एन्क्रिप्ट करके अलग रखे जाते हैं और सिर्फ़ ID जाँच तथा क़ानूनी / विवाद के मामलों में इस्तेमाल होते हैं। प्रॉपर्टी मालिक की सहमति का रिकॉर्ड (नाम, मोबाइल के आख़िरी 4 अंक, समय, और डिवाइस का एक-तरफ़ा हैश) तथा साइन किए फ़ॉर्म की फ़ोटो, मालिक के हस्ताक्षर (नाम के अक्षर या हाथ से बनाया साइन) और तय हुई ब्रोकरेज की शर्तें बायपास सुरक्षा और विवाद के लिए रखी जाती हैं। किसी खरीदार की साइट विज़िट पक्की होने या ऑफ़र भेजने पर “खरीदार सुरक्षा” का रिकॉर्ड रखा जाता है — खरीदार का नाम, मोबाइल के आख़िरी 4 अंक और मोबाइल का एक-तरफ़ा हैश — ताकि खरीदार को पहले लाने वाले ब्रोकर की सुरक्षा हो; यह दूसरे ब्रोकरों को कभी नहीं दिखता। ब्रोकर अपने क्लाइंट के लिए “क्लाइंट रूम” खोले तो क्लाइंट का नाम, मोबाइल का एक-तरफ़ा हैश और आख़िरी 4 अंक, शेयर की गई प्रॉपर्टी, क्लाइंट की पसंद / विज़िट अनुरोध और चैट रखी जाती है; चैट सिर्फ़ वह क्लाइंट (लिंक + मोबाइल कोड से) और वही ब्रोकर पढ़ सकते हैं — लिस्टिंग ब्रोकर, को-ब्रोकर, टीम या GENZ स्टाफ़ नहीं; रूम बंद होने के 90 दिन बाद चैट मिटा दी जाती है। क्लाइंट रूम जिन फ़ोन पर खुला है (ज़्यादा से ज़्यादा 2) उनका प्रकार (जैसे “Android · Chrome”) और आख़िरी बार खोलने का समय ब्रोकर को दिखता है। “दुकान QR पार्टनर” में: दुकानदार का नाम, दुकान, इलाका, मोबाइल का एक-तरफ़ा हैश और आख़िरी 4 अंक, तय हिस्सा और उसकी मंज़ूरी का रिकॉर्ड रखा जाता है; QR स्कैन करके फ़ॉर्म भरने वाले ग्राहक का नाम, मोबाइल, इलाका, ज़रूरत और सहमति का समय उसी ब्रोकर के पास जाता है — दुकानदार को सिर्फ़ ज़रूरत, इलाका, मोबाइल के आख़िरी 4 अंक और लीड की प्रगति दिखती है। ब्रोकर मालिक / खरीदार को ब्रोकरेज बिल भेजे तो उसका नाम, मोबाइल, बिल की रकम और (अगर वह लिंक पर लिखे) भुगतान का UTR रखा जाता है; बिल का लिंक सिर्फ़ उसी व्यक्ति को भेजा जाता है, और लिंक कितनी बार खुला इसकी गिनती ब्रोकर को दिखती है। पैसा सीधे ब्रोकर को जाता है — GENZ नहीं रखता। साइट विज़िट से पहले खरीदार “सीधा सौदा नहीं” की सहमति देता है (टिक + अपने मोबाइल का कोड) — उसका नाम, मोबाइल के आख़िरी 4 अंक और मोबाइल का एक-तरफ़ा हैश, सहमति का समय और शब्दों का संस्करण विवाद के सबूत के तौर पर रखे जाते हैं। जब कोई ब्रोकर किसी खरीदार / मालिक के कमीशन न देने या सीधा सौदा करने की रिपोर्ट करता है (“नेटवर्क वॉच”), तो उस मोबाइल का एक-तरफ़ा हैश, आख़िरी 4 अंक, ब्रोकर का लिखा नाम और विवरण, और रिपोर्ट करने वाला ब्रोकर GENZ स्टाफ़ के पास रखा जाता है; बाकी नेटवर्क को सिर्फ़ “चेतावनी” या “ब्लॉक” का निशान और आख़िरी 4 अंक दिखते हैं — नाम, विवरण या रिपोर्टर कभी नहीं; निशान की अपील की जा सकती है, ग़लत रिपोर्ट ख़ारिज होती है, और ब्लॉक 1 साल बाद दोबारा जाँचा जाता है। ब्रोकर अपनी फ़ोटो ID कार्ड के लिए डाले तो उसकी सहमति से फ़ोटो GENZ के सर्वर पर रखी जाती है; GENZ स्टाफ़ उसे ID से मिलाकर जाँचता है, मंज़ूर होने पर ही दूसरे लॉग-इन सदस्यों को दिखती है (सार्वजनिक नहीं), नामंज़ूर फ़ोटो तुरंत मिटा दी जाती है, और खाता मिटाने पर फ़ोटो भी मिटती है। फ़ोन अलर्ट चालू करने पर ब्राउज़र का पुश पता रखा जाता है — अलर्ट में किसी ग्राहक का नाम या नंबर नहीं जाता।' : 'Name, mobile, e-mail, company, RERA number, PAN/GSTIN (for KYC only), property and deal data, site-visit records, and login / audit logs for security. From brokers we also take the PAN, the Aadhaar number and the address — with your consent; the Aadhaar number and address are stored encrypted, apart from your profile, and used only for ID checks and legal or dispute matters. For an owner’s consent to list a property we keep the consent record (name, last 4 digits of the mobile, time and a one-way hash of the device), the photo of a signed form, the owner’s signature (typed initials or a drawn signature) and the agreed brokerage terms, for bypass protection and disputes. When a buyer’s site visit is verified or an offer is sent, we keep a “buyer protection” record — the buyer’s name, the last 4 digits of the mobile and a one-way hash of the mobile — so the broker who brought the buyer first is protected; other brokers never see it. When a broker opens a “Client Room” for his own client we keep the client’s name, a one-way hash and the last 4 digits of the mobile, the properties shared, the client’s likes and visit requests, and the chat; only that client (through the link plus a code sent to his mobile) and that broker can read the chat — not the listing broker, a co-broker, the team or GENZ staff — and the chat is erased 90 days after the room is closed. The broker sees on which phones the room is open (at most 2: the kind, e.g. “Android · Chrome”, and when it was last opened). For “Shop QR partners” we keep the shopkeeper’s name, shop, area, a one-way hash and the last 4 digits of his mobile, the agreed share and the record of his acceptance; a customer who scans the QR and fills the form gives his name, mobile, area, need and consent to that broker only — the shopkeeper sees just the need, the area, the last 4 digits and the lead’s progress. When a broker sends the owner or the buyer a brokerage bill, we keep that person’s name and mobile, the bill amount and (if he writes it on the link) the payment UTR; the bill link goes only to that person, and the broker sees how many times it was opened. The money goes straight to the broker — GENZ does not hold it. Before a site visit the buyer gives a “no direct deal” acknowledgement (a tick plus a code sent to his own mobile) — we keep his name, the last 4 digits and a one-way hash of the mobile, the time and the wording version, as evidence in a dispute. When a broker reports a buyer or owner for refusing commission or going around the broker (“Network Watch”), GENZ staff keep a one-way hash and the last 4 digits of that mobile, the name and note the broker wrote, and who reported; the rest of the network sees only a “caution” or “blocked” mark and the last 4 digits — never the name, the note or the reporter. The mark can be appealed, a wrong report is dismissed, and a block is reviewed again after one year. If a broker adds a photo for his ID card, GENZ keeps it with his consent; GENZ staff compare it with his ID and only an approved photo is shown to other signed-in members (never public); a rejected photo is deleted at once, and an account erasure deletes the photo too. If you turn on phone alerts we keep your browser’s push address — an alert never carries a client’s name or number.'}</p>
            </Section>
            <Section title={hi ? '2. उपयोग का उद्देश्य' : '2. Why we use it'}>
              <p>{hi ? 'सदस्य सत्यापन, ब्रोकर सहयोग, एंटी-बायपास प्रमाण, कमीशन रिकॉर्ड, धोखाधड़ी रोकथाम और कानूनी अनुपालन। आपकी सहमति के बिना डेटा बेचा या विज्ञापन के लिए साझा नहीं किया जाता।' : 'Member verification, broker collaboration, anti-bypass evidence, commission records, fraud prevention and legal compliance. We do not sell your data or share it for advertising.'}</p>
            </Section>
            <Section title={hi ? '3. कौन देख सकता है' : '3. Who can see it'}>
              <p>{hi ? 'आपके डील के सहभागी, प्लेटफ़ॉर्म एडमिन और (दस्तावेज़ों के लिए) नियुक्त कानूनी सलाहकार। ग्राहक का फ़ोन नंबर एडमिन को मास्क होकर दिखता है। आपका पूरा आधार नंबर और पता सिर्फ़ GENZ का सुपरएडमिन खोल सकता है — लिखित कारण के साथ; हर बार खुलना दर्ज होता है और आपको “मेरा PAN और आधार” में दिखता है।' : 'Participants of your deals, platform administrators and (for documents) the empanelled legal counsel. Customer phone numbers are masked for administrators. Your full Aadhaar number and address can be opened only by the GENZ superadmin, with a written reason; every opening is logged and shown to you under “My PAN & Aadhaar”.'}</p>
            </Section>
            <Section title={hi ? '4. आपके अधिकार (DPDP अधिनियम 2023)' : '4. Your rights (DPDP Act 2023)'}>
              <p>{hi ? 'आप अपना डेटा देखने/डाउनलोड करने, सुधार कराने, मिटाने और शिकायत करने का अधिकार रखते हैं। ऐप में "मेरा डेटा" से अनुरोध करें; हम 15 दिन में उत्तर देते हैं।' : 'You may access / download your data, request correction or erasure, withdraw consent and file a grievance — use “My data” in the app. We respond within 15 days.'}</p>
              <p>{cfg?.retentionNote}</p>
            </Section>
            <Section title={hi ? '5. सुरक्षा' : '5. Security'}>
              <p>{hi ? 'पासवर्ड एन्क्रिप्टेड (scrypt) हैं, सत्र सुरक्षित कुकी में हैं, और हर संवेदनशील क्रिया ऑडिट-लॉग होती है।' : 'Passwords are hashed (scrypt), sessions use secure cookies and every sensitive action is written to a tamper-evident audit log.'}</p>
            </Section>
            <Section title={hi ? '6. शिकायत अधिकारी' : '6. Grievance Officer'}>
              <p>{cfg?.grievanceOfficer.name} · <a className="text-blue-700 underline" href={`mailto:${cfg?.grievanceOfficer.email}`}>{cfg?.grievanceOfficer.email}</a>{cfg?.grievanceOfficer.phone ? ` · ${cfg.grievanceOfficer.phone}` : ''}</p>
              <p>{cfg?.address}</p>
            </Section>
            <button onClick={() => go('#/terms')} className="mt-6 text-xs font-semibold text-blue-700 underline">{hi ? 'नियम और शर्तें देखें' : 'Read the Terms of Use'}</button>
          </>
        ) : (
          <>
            <Section title={hi ? '1. केवल आमंत्रित सदस्य' : '1. Invite-only membership'}>
              <p>{hi ? 'प्लेटफ़ॉर्म सत्यापित ब्रोकर, बिल्डर, मालिक और सलाहकारों के लिए है। गलत जानकारी देने पर खाता निलंबित/ब्लैकलिस्ट हो सकता है।' : 'The platform is for verified brokers, builders, owners and advisors. False information can lead to suspension or blacklisting.'}</p>
            </Section>
            <Section title={hi ? '2. एंटी-बायपास' : '2. Anti-bypass'}>
              <p>{hi ? 'प्लेटफ़ॉर्म पर परिचय हुए ग्राहक/प्रॉपर्टी पर सहमत कमीशन और रजिस्ट्रेशन सुरक्षा (60 दिन) लागू है। प्लेटफ़ॉर्म को बायपास करना उल्लंघन है और विवाद प्रक्रिया से तय होगा।' : 'Introductions made on the platform carry the agreed commission and registration protection (60 days). Bypassing the platform is a breach and is handled through the dispute process.'}</p>
            </Section>
            <Section title={hi ? '3. कमीशन और भुगतान' : '3. Commission & payments'}>
              <p>{hi ? 'कमीशन सहभागियों के आपसी हस्ताक्षरित एग्रीमेंट के अनुसार होगा। प्लेटफ़ॉर्म भुगतान रिकॉर्ड करता है; यह बैंकिंग या एस्क्रो सेवा नहीं है। TDS लागू कानून के अनुसार।' : 'Commission follows the agreement signed by the participants. The platform records payments; it is not a bank or escrow. TDS applies as per law.'}</p>
            </Section>
            <Section title={hi ? '4. जानकारी की सटीकता' : '4. Accuracy & RERA'}>
              <p>{hi ? 'लिस्टिंग की सटीकता पोस्ट करने वाले की ज़िम्मेदारी है। RERA पंजीकरण की वैधता राज्य RERA पोर्टल पर जाँचें।' : 'Listing accuracy is the poster\'s responsibility. Verify RERA registrations on the state RERA portal.'}</p>
            </Section>
            <Section title={hi ? '5. विवाद' : '5. Disputes & jurisdiction'}>
              <p>{hi ? `पहले प्लेटफ़ॉर्म की मध्यस्थता; उसके बाद ${JURISDICTION_HI} के न्यायालयों का क्षेत्राधिकार।` : `Platform mediation first; thereafter the courts at ${JURISDICTION} have jurisdiction.`}</p>
            </Section>
            <button onClick={() => go('#/privacy')} className="mt-6 text-xs font-semibold text-blue-700 underline">{hi ? 'प्राइवेसी पॉलिसी देखें' : 'Read the Privacy Policy'}</button>
          </>
        )}
      </div>
    </div>
  );
};
