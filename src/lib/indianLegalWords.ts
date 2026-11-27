/**
 * Indian Number to Words converter according to Indian Financial & Legal standards
 * (Negotiable Instruments Act / Bayana Earnest Money / Registered Agreement formatting)
 */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const HINDI_ONES = ['', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ'];
const HINDI_TEENS = ['दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस'];
const HINDI_TENS = ['', '', 'बीस', 'तीस', 'चालीस', 'पचास', 'साठ', 'सत्तर', 'अस्सी', 'नब्बे'];

function convertBelowThousand(n: number): string {
  let str = '';
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 20) {
    str += TENS[Math.floor(n / 10)] + ' ';
    n %= 10;
  } else if (n >= 10) {
    str += TEENS[n - 10] + ' ';
    return str.trim();
  }
  if (n > 0) {
    str += ONES[n] + ' ';
  }
  return str.trim();
}

/**
 * Converts numeric INR amount into standard legal English words
 * Example: 12500000 -> "Rupees One Crore Twenty Five Lakh Only"
 */
export function numberToIndianWords(amount: number | null | undefined): string {
  if (!amount || isNaN(amount) || amount <= 0) return 'Rupees Zero Only';
  const rounded = Math.round(amount);

  const crore = Math.floor(rounded / 10000000);
  const lakh = Math.floor((rounded % 10000000) / 100000);
  const thousand = Math.floor((rounded % 100000) / 1000);
  const remainder = rounded % 1000;

  const parts: string[] = [];

  if (crore > 0) {
    parts.push(`${convertBelowThousand(crore)} Crore`);
  }
  if (lakh > 0) {
    parts.push(`${convertBelowThousand(lakh)} Lakh`);
  }
  if (thousand > 0) {
    parts.push(`${convertBelowThousand(thousand)} Thousand`);
  }
  if (remainder > 0) {
    parts.push(convertBelowThousand(remainder));
  }

  return `Rupees ${parts.join(' ')} Only`.replace(/\s+/g, ' ');
}

/**
 * Converts numeric INR amount into legal Hindi words
 * Example: 7500000 -> "रुपये पचहत्तर लाख मात्र"
 */
export function numberToHindiWords(amount: number | null | undefined): string {
  if (!amount || isNaN(amount) || amount <= 0) return 'रुपये शून्य मात्र';
  const rounded = Math.round(amount);

  const crore = Math.floor(rounded / 10000000);
  const lakh = Math.floor((rounded % 10000000) / 100000);
  const thousand = Math.floor((rounded % 100000) / 1000);
  const remainder = rounded % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${crore} करोड़`);
  if (lakh > 0) parts.push(`${lakh} लाख`);
  if (thousand > 0) parts.push(`${thousand} हज़ार`);
  if (remainder > 0) parts.push(`${remainder}`);

  return `रुपये ${parts.join(' ')} मात्र`.replace(/\s+/g, ' ');
}

/**
 * Real-time helper for number inputs to prevent broker zero-count mistakes (e.g. ₹75,00,000 -> ₹75 L)
 */
export function formatPriceInputHelper(val: number | '' | null | undefined): string {
  if (val === '' || val === null || val === undefined || isNaN(Number(val)) || Number(val) <= 0) {
    return '';
  }
  const n = Number(val);
  if (n >= 10000000) {
    const cr = (n / 10000000).toFixed(2).replace(/\.00$/, '');
    return `₹${cr} Crore (${numberToIndianWords(n)})`;
  }
  if (n >= 100000) {
    const lk = (n / 100000).toFixed(2).replace(/\.00$/, '');
    return `₹${lk} Lakh (${numberToIndianWords(n)})`;
  }
  if (n >= 1000) {
    const th = (n / 1000).toFixed(1).replace(/\.0$/, '');
    return `₹${th} Thousand (${numberToIndianWords(n)})`;
  }
  return `₹${n.toLocaleString('en-IN')}`;
}
