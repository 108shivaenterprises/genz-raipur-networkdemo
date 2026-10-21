/**
 * GENZ Academy — short lessons. Every lesson works as a text checklist even before a video is attached:
 * put a YouTube video id in `youtube` (11 characters, e.g. "dQw4w9WgXcQ") and the player appears automatically.
 * Video ids are intentionally empty here: add your own recordings, nothing is invented.
 */
export interface Lesson { id: string; topic: 'RERA' | 'DOCS' | 'NEGOTIATION' | 'APP'; title: { en: string; hi: string }; youtube: string; points: { en: string[]; hi: string[] } }

export const LESSONS: Lesson[] = [
  { id: 'rera-basics', topic: 'RERA', youtube: '', title: { en: 'RERA basics for brokers', hi: 'ब्रोकर के लिए RERA की बुनियादी बातें' },
    points: { en: ['Brokers dealing in registered projects need their own RERA registration.', 'Always quote the project RERA number in every brochure.', 'Check the project on your state RERA website before you share it.'],
      hi: ['रजिस्टर्ड प्रोजेक्ट में डील करने वाले ब्रोकर का अपना RERA रजिस्ट्रेशन ज़रूरी है।', 'हर ब्रोशर में प्रोजेक्ट का RERA नंबर ज़रूर लिखें।', 'क्लाइंट को भेजने से पहले अपने राज्य की RERA वेबसाइट पर प्रोजेक्ट जाँचें।'] } },
  { id: 'docs-checklist', topic: 'DOCS', youtube: '', title: { en: 'Documents to check before a deal', hi: 'डील से पहले कौन से कागज़ देखें' },
    points: { en: ['Registered sale deed and the seller’s ID match.', 'Khasra / B-1 nakal and mutation (namantaran) are in the seller’s name.', 'Encumbrance / no-dues proof and latest tax receipt.', 'For plots: diversion order and approved layout.'],
      hi: ['रजिस्टर्ड सेल डीड और विक्रेता की ID मेल खाए।', 'खसरा / बी-1 नकल और नामांतरण विक्रेता के नाम पर हो।', 'ऋणभार (encumbrance) / नो-ड्यूज़ का प्रमाण और ताज़ा टैक्स रसीद।', 'प्लॉट के लिए: डायवर्सन आदेश और स्वीकृत लेआउट।'] } },
  { id: 'negotiation', topic: 'NEGOTIATION', youtube: '', title: { en: 'Negotiation: keep the deal alive', hi: 'मोलभाव: डील को ज़िंदा रखें' },
    points: { en: ['Ask the client’s real budget before showing anything.', 'Never reveal the owner’s floor price early.', 'Write the commission split in the deal room before the site visit.'],
      hi: ['कुछ दिखाने से पहले क्लाइंट का असली बजट पूछें।', 'मालिक की न्यूनतम कीमत जल्दी न बताएँ।', 'साइट विज़िट से पहले कमीशन का बँटवारा डील रूम में लिख लें।'] } },
  { id: 'app-start', topic: 'APP', youtube: '', title: { en: 'GENZ app in 5 minutes', hi: '5 मिनट में GENZ ऐप' },
    points: { en: ['Add your clients in the Clients tab (name, budget, area).', 'Open Today’s matches every morning.', 'Tap “Still available” on your listings once a month.', 'Share a tracked link instead of forwarding PDFs.'],
      hi: ['Clients टैब में अपने क्लाइंट जोड़ें (नाम, बजट, इलाका)।', 'हर सुबह “आज के मैच” खोलें।', 'महीने में एक बार अपनी लिस्टिंग पर “अभी भी उपलब्ध” दबाएँ।', 'PDF फॉरवर्ड करने की जगह ट्रैक्ड लिंक भेजें।'] } },
  { id: 'app-privacy', topic: 'APP', youtube: '', title: { en: 'Protecting client and owner data', hi: 'क्लाइंट और मालिक का डेटा सुरक्षित रखें' },
    points: { en: ['Share documents as view-only, never as a forwarded file.', 'Take the client’s consent before saving their number.', 'Report fake or sold listings — it keeps the network clean.'],
      hi: ['कागज़ात “सिर्फ़ देखने” वाले मोड में शेयर करें, फाइल फॉरवर्ड न करें।', 'क्लाइंट का नंबर सेव करने से पहले उसकी सहमति लें।', 'फर्जी या बिक चुकी लिस्टिंग रिपोर्ट करें — इससे नेटवर्क साफ़ रहता है।'] } },
];
