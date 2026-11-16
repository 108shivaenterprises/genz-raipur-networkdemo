/** v160 — a listing turned into ready-to-paste text: a WhatsApp group post, an Instagram caption with hashtags and a short reel script.
 *  Never carries the owner's name / number or the exact address — only what a public post may show. Pure function: the screen and the tests use it. */
export interface PostHome {
  title: string; propertyType: string; transactionType: 'Sale' | 'Rent' | 'Lease'; city?: string; locality: string; askingPrice: number;
  builtUpAreaSqFt?: number; plotAreaSqFt?: number; tags?: string[];
}
export type PostLang = 'en' | 'hi';
const tag = (s: string) => '#' + String(s || '').replace(/[^A-Za-z0-9ऀ-ॿ]+/g, '');
/** 8500000 → "85 Lakh", 25000000 → "2.5 Cr", 18000 → "18,000" */
export function priceWords(n: number, lang: PostLang): string {
  if (n >= 10_000_000) return `${+(n / 10_000_000).toFixed(2)} ${lang === 'hi' ? 'करोड़' : 'Cr'}`;
  if (n >= 100_000) return `${+(n / 100_000).toFixed(2)} ${lang === 'hi' ? 'लाख' : 'Lakh'}`;
  return n.toLocaleString('en-IN');
}
export function hashtagsFor(h: PostHome): string[] {
  const rent = h.transactionType !== 'Sale';
  const type = String(h.propertyType || 'property').toLowerCase();
  const all = [
    h.city && tag(h.city + 'RealEstate'), h.city && tag(h.city + 'Property'), tag(h.locality), h.city && tag(`${type}${rent ? 'ForRent' : 'ForSale'}${h.city}`),
    tag(`${type}${rent ? 'ForRent' : 'ForSale'}`), rent ? '#RentalHome' : '#ResaleProperty', '#RealEstateIndia', '#PropertyBroker', '#GENZBrokerNetwork',
    ...(h.tags || []).slice(0, 2).map(tag),
  ].filter(Boolean) as string[];
  return [...new Set(all)].slice(0, 12);
}
export function makePosts(h: PostHome, o: { lang: PostLang; broker: string; phone?: string; link?: string }) {
  const hi = o.lang === 'hi'; const rent = h.transactionType !== 'Sale';
  const area = h.builtUpAreaSqFt || h.plotAreaSqFt;
  const price = `₹${priceWords(h.askingPrice, o.lang)}${rent ? (hi ? ' / माह' : ' / month') : ''}`;
  const where = [h.locality, h.city].filter(Boolean).join(', ');
  const kind = `${h.propertyType} ${hi ? (rent ? 'किराये के लिए' : 'बिकाऊ') : (rent ? 'for rent' : 'for sale')}`;
  const areaLine = area ? `📐 ${area.toLocaleString('en-IN')} sq ft` : '';
  const who = o.phone ? `${o.broker} · ${o.phone}` : o.broker;
  const tags = hashtagsFor(h);
  const group = [`🏡 ${kind}`, `📍 ${where}`, `💰 ${price}`, areaLine, h.title ? `✨ ${h.title}` : '', hi ? `📞 ${who}` : `📞 ${who}`, o.link || '', hi ? '🤝 को-ब्रोकिंग का स्वागत है' : '🤝 Co-broking welcome'].filter(Boolean).join('\n');
  const insta = [hi ? `${kind} — ${where} 🏡` : `${kind} — ${where} 🏡`, '', `💰 ${price}`, areaLine, h.title ? `✨ ${h.title}` : '', '', hi ? `📩 DM करें या कॉल करें: ${who}` : `📩 DM or call: ${who}`, '', tags.join(' ')].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  const reel = hi
    ? [`🎬 रील (15–20 सेकंड)`, `1) शुरुआत (2 सेकंड): गेट / बाहर का दृश्य — लिखें: "${where} में ${h.propertyType} ${rent ? 'किराये पर' : 'बिकाऊ'}"`, `2) अंदर घूमकर दिखाएँ (8 सेकंड): हॉल → किचन → कमरा`, `3) ख़ास बात (4 सेकंड): ${h.title || 'सबसे अच्छी चीज़ दिखाएँ'}`, `4) आख़िर में (3 सेकंड): "दाम ${price} — कॉल करें ${who}"`, `🎵 हल्का म्यूज़िक · कैप्शन में ऊपर वाला टेक्स्ट और हैशटैग लगाएँ`].join('\n')
    : [`🎬 Reel (15–20 sec)`, `1) Hook (2 s): gate / outside shot — text on screen: "${h.propertyType} ${rent ? 'for rent' : 'for sale'} in ${where}"`, `2) Walk-through (8 s): hall → kitchen → bedroom`, `3) Best thing (4 s): ${h.title || 'show the one best feature'}`, `4) End (3 s): "Price ${price} — call ${who}"`, `🎵 Soft music · paste the caption and hashtags above`].join('\n');
  return { group, insta, reel, hashtags: tags };
}
