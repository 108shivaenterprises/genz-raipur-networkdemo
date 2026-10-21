/**
 * The activity feed (GET /api/activity-feed) is composed on the server in English.
 * In Hindi mode the client re-reads each line with these patterns. Names, property titles,
 * localities and rupee amounts are data and stay exactly as the server sent them.
 * Anything that doesn't match a pattern is shown unchanged (never dropped, never invented).
 */
type Lbl = (kind: 'propertyType' | 'dealStage' | 'role', v: string) => string;

const TITLE_HI: Record<string, string> = {
  'New Property Listing Published': 'नई प्रॉपर्टी लिस्टिंग प्रकाशित',
  'Deal Room Closed & Commission Settled': 'डील रूम बंद और कमीशन निपटा',
  'Deal Room Closed': 'डील रूम बंद',
  'Physical Site Visit Completed & Verified': 'साइट विज़िट पूरी और वेरिफ़ाइड',
  'New Site Inspection Scheduled': 'नई साइट विज़िट शेड्यूल हुई',
  'Partner request received': 'पार्टनर रिक्वेस्ट मिली',
  'Partner shortlisted': 'पार्टनर शॉर्टलिस्ट हुआ',
  'Partnership paused': 'पार्टनरशिप रोकी गई',
  'Partnership ended': 'पार्टनरशिप समाप्त',
  'Partner request declined': 'पार्टनर रिक्वेस्ट अस्वीकृत',
  'Sales Associate Broker Appointed': 'सेल्स एसोसिएट ब्रोकर नियुक्त',
};

export function localizeActivity(
  a: { title: string; description: string },
  lang: 'hi' | 'en' | string,
  label: Lbl,
): { title: string; description: string } {
  if (lang !== 'hi') return { title: a.title, description: a.description };

  let title = TITLE_HI[a.title];
  if (!title) {
    const m = a.title.match(/^Deal Room Active: Stage "(.+)"$/);
    if (m) title = `डील रूम चालू: स्टेज "${label('dealStage', m[1])}"`;
  }
  title = title || a.title;

  const d = a.description;
  let desc = d;
  let m: RegExpMatchArray | null;

  if ((m = d.match(/^"(.+)" \((.+)\) listed in (.+?), ?(.*?) with confidential price protection\.$/))) {
    const place = m[4] ? `${m[3]}, ${m[4]}` : m[3];
    desc = `"${m[1]}" (${label('propertyType', m[2])}) ${place} में लिस्ट हुई — कीमत गोपनीय सुरक्षा के साथ।`;
  } else if ((m = d.match(/^Deal (\S+) for (.+) between (.+) & (.+?)\.(?: Expected Brokerage: (₹[\d,]+)\.)?$/))) {
    desc = `डील ${m[1]} — ${m[2]} (${m[3]} और ${m[4]} के बीच)।${m[5] ? ` अपेक्षित ब्रोकरेज: ${m[5]}।` : ''}`;
  } else if ((m = d.match(/^Verified physical inspection conducted for (.+) at (.+)\. (.+) challenge recorded\.$/))) {
    desc = `${m[1]} के लिए ${m[2]} पर साइट विज़िट वेरिफ़ाई हुई। ${m[3]} चैलेंज दर्ज।`;
  } else if ((m = d.match(/^Scheduled inspection for buyer (.+) on (.+)\.$/))) {
    desc = `खरीदार ${m[1]} के लिए साइट विज़िट ${m[2]} को शेड्यूल हुई।`;
  } else if ((m = d.match(/^(.+) applied to sell (.+)\.$/))) {
    desc = `${m[1]} ने ${m[2]} बेचने के लिए आवेदन किया।`;
  } else if ((m = d.match(/^(You are|.+ is) shortlisted for (.+) — awaiting the builder\.$/))) {
    desc = m[1] === 'You are' ? `आप ${m[2]} के लिए शॉर्टलिस्ट हुए हैं — बिल्डर के जवाब का इंतज़ार।` : `${m[1].replace(/ is$/, '')} ${m[2]} के लिए शॉर्टलिस्ट हुए — बिल्डर के जवाब का इंतज़ार।`;
  } else if ((m = d.match(/^(Your|.+'s) partnership on (.+?) (is paused|was ended)(?:: (.+))?\.$/))) {
    const who = m[1] === 'Your' ? 'आपकी' : `${m[1].replace(/'s$/, '')} की`;
    const what = m[3] === 'is paused' ? 'रोकी गई है' : 'समाप्त कर दी गई';
    desc = `${who} ${m[2]} पर पार्टनरशिप ${what}${m[4] ? `: ${m[4]}` : ''}।`;
  } else if ((m = d.match(/^(Your request|.+'s request) for (.+) was declined(?:: (.+))?\.$/))) {
    const who = m[1] === 'Your request' ? 'आपकी रिक्वेस्ट' : `${m[1].replace(/'s request$/, '')} की रिक्वेस्ट`;
    desc = `${who} ${m[2]} के लिए अस्वीकृत हुई${m[3] ? `: ${m[3]}` : ''}।`;
  } else if ((m = d.match(/^(.+) appointed as authorized sales associate for (.+) \(([\d.]+)% commission\)\.$/))) {
    desc = `${m[1]} को ${m[2]} के लिए अधिकृत सेल्स एसोसिएट नियुक्त किया गया (${m[3]}% कमीशन)।`;
  }
  return { title, description: desc };
}
