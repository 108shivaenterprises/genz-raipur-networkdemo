/**
 * Draft message templates for brokers (WhatsApp / SMS). Three languages.
 * These are DRAFTS — not legal advice and not "pre-approved" by any regulator. Have your own lawyer review any
 * template that creates an obligation (offer letter, payment reminder) before you rely on it.
 */
export type TemplateLang = 'en' | 'hi';
export type TemplateKind = 'INTRO' | 'INSPECTION' | 'OFFER' | 'PAYMENT';

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  INTRO: 'Introduction', INSPECTION: 'Site visit invite', OFFER: 'Offer summary', PAYMENT: 'Payment reminder',
};
export const TEMPLATE_LABELS_HI: Record<TemplateKind, string> = {
  INTRO: 'परिचय', INSPECTION: 'साइट विज़िट का न्योता', OFFER: 'ऑफ़र सारांश', PAYMENT: 'भुगतान रिमाइंडर',
};
export const LANG_LABELS: Record<TemplateLang, string> = { en: 'English', hi: 'हिंदी' };

const T: Record<TemplateKind, Record<TemplateLang, string>> = {
  INTRO: {
    en: 'Hello {customer}, this is {broker} ({company}). {rera}I help with verified properties in {city}. May I share a few options that match your need for {project}? Reply YES and I will send details.',
    hi: 'नमस्ते {customer} जी, मैं {broker} ({company}) बोल रहा/रही हूँ। {rera}मैं {city} में वेरिफ़ाइड प्रॉपर्टी में मदद करता/करती हूँ। क्या मैं {project} से जुड़े कुछ विकल्प भेज सकता/सकती हूँ? "हाँ" लिखें, मैं डिटेल भेजता/भेजती हूँ।',
  },
  INSPECTION: {
    en: 'Hello {customer}, you are invited for a site visit of {project} on {date} at {time}. Please carry a photo ID. Visit is arranged through {broker} ({company}). Reply to confirm.',
    hi: 'नमस्ते {customer} जी, {project} की साइट विज़िट के लिए आपको {date} को {time} बजे आमंत्रित किया जाता है। कृपया फ़ोटो आईडी साथ लाएँ। विज़िट {broker} ({company}) के माध्यम से है। कन्फ़र्म करने के लिए जवाब दें।',
  },
  OFFER: {
    en: 'Hello {customer}, as discussed — {project}, offer price ₹{amount}. This is a summary of the discussion, not a binding agreement; terms are final only in the signed agreement. Valid until {date}. — {broker}, {company}. {rera}',
    hi: 'नमस्ते {customer} जी, चर्चा के अनुसार — {project}, ऑफ़र मूल्य ₹{amount}। यह चर्चा का सार है, बाध्यकारी अनुबंध नहीं; शर्तें केवल हस्ताक्षरित अनुबंध में ही अंतिम होंगी। वैधता: {date} तक। — {broker}, {company}। {rera}',
  },
  PAYMENT: {
    en: 'Hello {customer}, a gentle reminder: the instalment of ₹{amount} for {project} is due on {date}. Please pay as per the schedule and share the receipt. Thank you. — {broker}, {company}',
    hi: 'नमस्ते {customer} जी, विनम्र अनुरोध: {project} की ₹{amount} की किस्त {date} को देय है। कृपया शेड्यूल के अनुसार भुगतान करें और रसीद साझा करें। धन्यवाद। — {broker}, {company}',
  },
};

export function renderTemplate(kind: TemplateKind, lang: TemplateLang, v: Record<string, string | undefined>): string {
  const vars: Record<string, string> = {
    customer: 'Customer', broker: '', company: '', city: '', project: 'the property', date: '', time: '', amount: '', rera: '', ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x ?? ''])),
  };
  if (vars.rera && !/^RERA/i.test(vars.rera)) vars.rera = `RERA: ${vars.rera}. `;
  return T[kind][lang].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '').replace(/\s{2,}/g, ' ').replace(/\(\s*\)/g, '').trim();
}

export const waLink = (phone: string, text: string) => {
  const d = phone.replace(/\D/g, '').slice(-10);
  return `https://wa.me/${d.length === 10 ? '91' + d : ''}?text=${encodeURIComponent(text)}`;
};
