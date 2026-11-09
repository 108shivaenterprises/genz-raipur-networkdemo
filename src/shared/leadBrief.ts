/** v120 — the broker's "deal brief" for a QR-chat customer: how hot he is (every point explained) and the ONE next step.
 *  Pure rules, no AI model: nothing of the customer's chat leaves the server. */
export type Timeline = 'NOW' | 'SOON' | 'LOOK';
export interface BriefIn {
  confirmed: boolean; revealed: boolean; hasBudget: boolean; hasType: boolean; timeline?: Timeline;
  homesSent: number; networkCount: number; viewed: number; visitAsked: number; visitOk: number;
  customerMsgs: number; lastCustomerHrs: number | null; needsBroker?: string; closed?: boolean;
}
export interface Brief { label: 'HOT' | 'WARM' | 'COLD'; score: number; reasons: { pts: number; en: string; hi: string }[]; next: { en: string; hi: string } }

export function leadBrief(i: BriefIn): Brief {
  const reasons: Brief['reasons'] = []; const add = (pts: number, en: string, hi: string) => { reasons.push({ pts, en, hi }); };
  if (i.closed) return { label: 'COLD', score: 0, reasons: [{ pts: 0, en: 'Closed lead', hi: 'लीड बंद है' }], next: { en: 'Nothing to do.', hi: 'कुछ करना बाकी नहीं।' } };
  if (i.confirmed) add(20, 'Confirmed his need himself', 'ज़रूरत खुद पक्की की');
  if (i.timeline === 'NOW') add(25, 'Wants it this month', 'इसी महीने लेना है');
  else if (i.timeline === 'SOON') add(10, 'Wants it in 1–3 months', '1–3 महीने में लेना है');
  else if (i.timeline === 'LOOK') add(-5, 'Only looking for now', 'अभी सिर्फ़ देख रहे हैं');
  if (i.visitOk) add(30, 'A site visit is fixed', 'साइट विज़िट तय है');
  else if (i.visitAsked) add(25, 'Asked for a site visit', 'साइट विज़िट माँगी है');
  if (i.viewed) add(Math.min(10, i.viewed * 5), `Opened photos / video of ${i.viewed} home(s)`, `${i.viewed} घर की फ़ोटो / वीडियो खोली`);
  if (i.needsBroker && i.needsBroker !== 'no-match') add(10, 'Asked to talk to you', 'आपसे बात करना चाहते हैं');
  if (i.hasBudget && i.hasType) add(5, 'Budget and type are clear', 'बजट और प्रकार साफ़ हैं');
  if (i.lastCustomerHrs !== null && i.lastCustomerHrs <= 24) add(10, 'Wrote in the last 24 hours', 'पिछले 24 घंटे में लिखा');
  else if (i.lastCustomerHrs !== null && i.lastCustomerHrs > 24 * 7) add(-15, 'Silent for over a week', 'एक हफ़्ते से चुप हैं');
  if (i.homesSent) add(5, `${i.homesSent} matching home(s) already shown`, `${i.homesSent} मेल खाते घर दिखाए जा चुके`);
  const score = Math.max(0, Math.min(100, reasons.reduce((a, r) => a + r.pts, 0)));
  const next =
    i.visitAsked ? { en: 'Answer his visit request now — a waiting visit goes cold fastest.', hi: 'उनकी विज़िट रिक्वेस्ट का जवाब अभी दें — रुकी विज़िट सबसे जल्दी ठंडी पड़ती है।' }
    : i.needsBroker && i.needsBroker !== 'no-match' ? { en: 'He asked for you — reply in the chat.', hi: 'उन्होंने आपको बुलाया है — चैट में जवाब दें।' }
    : !i.confirmed ? { en: 'He has not confirmed his need yet — ask him in the chat.', hi: 'ज़रूरत अभी पक्की नहीं हुई — चैट में पूछें।' }
    : !i.homesSent && i.networkCount > 0 ? { en: `No home of yours fits, but the network has ${i.networkCount} — ask the network from Buyers.`, hi: `आपका कोई घर मेल नहीं खाता, पर नेटवर्क में ${i.networkCount} हैं — Buyers से नेटवर्क से पूछें।` }
    : !i.homesSent ? { en: 'Nothing fits yet — his need is on GENZ Radar; add a listing or widen his area / budget with him.', hi: 'अभी कुछ मेल नहीं खाता — उनकी ज़रूरत GENZ Radar पर है; लिस्टिंग जोड़ें या उनसे इलाका / बजट बढ़वाएँ।' }
    : i.visitOk ? { en: 'Visit is fixed — remind him a day before and be there.', hi: 'विज़िट तय है — एक दिन पहले याद दिलाएँ और पहुँचें।' }
    : i.timeline === 'NOW' && i.revealed ? { en: 'He wants it this month — call him today and fix a visit.', hi: 'इसी महीने लेना है — आज ही कॉल करके विज़िट तय करें।' }
    : { en: 'Offer a visit for the home he opened, or send one more home.', hi: 'जो घर उन्होंने खोला उसकी विज़िट ऑफ़र करें, या एक और घर भेजें।' };
  return { label: score >= 60 ? 'HOT' : score >= 35 ? 'WARM' : 'COLD', score, reasons, next };
}
