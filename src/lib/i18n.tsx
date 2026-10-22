import React, { createContext, useContext, useState, useCallback } from 'react';

export type Lang = 'en' | 'hi';

const HI: Record<string, string> = {
  // shell
  'nav.home': 'होम', 'nav.propShort': 'प्रॉपर्टी', 'nav.buyersShort': 'खरीदार', 'nav.dealsShort': 'डील', 'nav.more': 'और', 'nav.g.today': 'आज', 'nav.g.property': 'प्रॉपर्टी और खरीदार', 'nav.g.deals': 'डील', 'nav.g.sales': 'सेल्स और टीम', 'nav.g.grow': 'नेटवर्क और ग्रोथ', 'nav.g.other': 'अन्य',
  'nav.dashboard': 'डैशबोर्ड', 'nav.builder': 'बिल्डर लॉन्चपैड', 'nav.crm': 'एसोसिएट्स CRM', 'nav.properties': 'प्रॉपर्टी',
  'nav.myProperties': 'मेरी प्रॉपर्टी', 'nav.requirements': 'खरीदार की ज़रूरतें', 'nav.matches': 'मैच', 'nav.deals': 'मेरी डील',
  'nav.myDeals': 'मेरी प्रॉपर्टी डील', 'nav.dd': 'टाइटल जाँच', 'nav.construction': 'कंस्ट्रक्शन लीड', 'nav.disputes': 'विवाद',
  'nav.audit': 'गतिविधि रिकॉर्ड', 'nav.onboarding': 'इनवाइट और KYC', 'nav.idreview': 'ID जाँच', 'nav.revenue': 'कमाई और ग्रोथ', 'nav.legal': 'लीगल डेस्क', 'nav.legalAdmin': 'लीगल हेल्प', 'nav.plans': 'GENZ मेंबरशिप', 'nav.plansAdmin': 'प्लान और फ़ीस',
  'nav.team': 'मेरी टीम', 'nav.share': 'शेयर किट', 'nav.landrecords': 'भूमि रिकॉर्ड', 'nav.myWork': 'मेरा काम', 'nav.connector': 'कनेक्टर डेस्क', 'nav.partners': 'दुकान QR पार्टनर', 'nav.myReferrals': 'मेरे रेफ़रल', 'nav.grow': 'नेटवर्क बढ़ाएँ', 'nav.citylaunch': 'सिटी लॉन्च',
  'nav.daily': 'आज और क्लाइंट', 'nav.pcontrol': 'प्रोजेक्ट कंट्रोल', 'nav.myprojects': 'मेरे प्रोजेक्ट', 'nav.desk': 'डील डेस्क', 'nav.network': 'टाई-अप और टियर',
  'nav.visits': 'विज़िट QR', 'nav.clientroom': 'क्लाइंट रूम', 'nav.pdocs': 'सुरक्षित दस्तावेज़', 'nav.propdocs': 'प्रॉपर्टी पेपर्स', 'nav.community': 'कम्युनिटी', 'nav.control': 'कंट्रोल सेंटर', 'nav.launchdesk': 'लॉन्च डेस्क',
  'common.signOut': 'साइन आउट', 'common.myData': 'मेरा डेटा', 'common.language': 'भाषा', 'common.verified': 'सत्यापित', 'common.cancel': 'रद्द करें', 'common.submit': 'जमा करें',
  // login
  'login.title': 'साइन इन', 'login.email': 'ईमेल या मोबाइल नंबर', 'login.password': 'पासवर्ड', 'login.button': 'साइन इन करें', 'login.invite': 'नए सदस्य? एडमिन से इनवाइट कोड लें, फिर "इनवाइट और KYC" में इस्तेमाल करें।',
  'login.privacy': 'प्राइवेसी पॉलिसी', 'login.terms': 'नियम और शर्तें', 'login.join': 'आमंत्रण कोड है? यहाँ जुड़ें', 'login.tagline': 'केवल आमंत्रण पर · पूरे भारत में',
  'pending.title': 'सत्यापन जारी है', 'pending.body': 'आपका खाता अभी जाँच में है। KYC दस्तावेज़ सत्यापित होने के बाद मार्केटप्लेस, डील रूम और CRM खुल जाएँगे।',
  // CRM
  'crm.title': 'बिल्डर ⇄ एसोसिएट्स CRM', 'crm.register': 'लीड दर्ज करें', 'crm.activeLeads': 'सक्रिय लीड', 'crm.overdue': 'बकाया फॉलो-अप', 'crm.pending': 'लंबित अनुमोदन',
  'crm.conversion': 'कन्वर्ज़न', 'crm.salesValue': 'बिक्री मूल्य', 'crm.collected': 'वसूली', 'crm.accrued': 'अर्जित ब्रोकरेज', 'crm.payable': 'अभी देय',
  'crm.pipeline': 'पाइपलाइन', 'crm.bookings': 'बुकिंग', 'crm.brokerage': 'ब्रोकरेज',
  'stage.NEW': 'नई', 'stage.CONTACTED': 'संपर्क हुआ', 'stage.SITE_VISIT_SCHEDULED': 'विज़िट तय', 'stage.SITE_VISITED': 'विज़िट हुई', 'stage.NEGOTIATION': 'बातचीत',
  'stage.BOOKING_REQUESTED': 'बुकिंग अनुरोध', 'stage.BOOKED': 'बुक', 'stage.LOST': 'खोई हुई',
  // onboarding / consent
  'reg.consent': 'मैंने प्राइवेसी पॉलिसी और नियम व शर्तें पढ़ ली हैं और अपने व्यक्तिगत डेटा के उपयोग की सहमति देता/देती हूँ।',
  // privacy center
  'priv.title': 'मेरा डेटा और प्राइवेसी', 'priv.export': 'मेरा डेटा डाउनलोड करें (JSON)', 'priv.erase': 'मेरा खाता मिटाने का अनुरोध', 'priv.grievance': 'शिकायत / सुधार का अनुरोध',
};

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (key: string, fallback: string) => string }
const I18n = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (_k, f) => f });

export const LangProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem('genz_lang') as Lang) === 'hi' ? 'hi' : 'en'; } catch { return 'en'; }
  });
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('genz_lang', l); } catch { /* preference only */ }
    document.documentElement.lang = l;
  }, []);
  const t = useCallback((key: string, fallback: string) => (lang === 'hi' ? HI[key] ?? fallback : fallback), [lang]);
  return <I18n.Provider value={{ lang, setLang, t }}>{children}</I18n.Provider>;
};

export const useI18n = () => useContext(I18n);
export const useTx = () => { const { lang } = useI18n(); return (en: string, hi: string) => (lang === 'hi' ? hi : en); };

export const LangToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { lang, setLang } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
      aria-label="Switch language"
      className={`rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900 ${className}`}
    >
      {lang === 'en' ? 'हिन्दी' : 'English'}
    </button>
  );
};
