export function formatINR(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(val)) return '₹0';
  if (val >= 10000000) {
    const cr = (val / 10000000).toFixed(2);
    return `₹${cr.replace(/\.00$/, '')} Cr`;
  }
  if (val >= 100000) {
    const lakh = (val / 100000).toFixed(2);
    return `₹${lakh.replace(/\.00$/, '')} L`;
  }
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
}

export function formatArea(sqft?: number): string {
  if (!sqft) return 'N/A';
  return `${sqft.toLocaleString('en-IN')} sq.ft`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function getRoleBadgeStyle(role: string): string {
  switch (role) {
    case 'SUPERADMIN':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    case 'ADMIN':
      return 'bg-blue-100 text-blue-900 border-blue-300';
    case 'BROKER':
      return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    case 'PROPERTY_OWNER':
      return 'bg-purple-100 text-purple-900 border-purple-300';
    case 'BUYER_TENANT':
      return 'bg-sky-100 text-sky-900 border-sky-300';
    case 'CONTRACTOR':
      return 'bg-orange-100 text-orange-900 border-orange-300';
    case 'DEVELOPER_BUILDER':
      return 'bg-amber-100 text-amber-950 border-amber-300 font-bold';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300';
  }
}

/**
 * Returns the web app base URL suitable for generating deep links
 */
export function getAppBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
  }
  return 'https://ais-pre-ic44jqwdaroh2tkmlueoh5-570785440685.asia-southeast1.run.app';
}

/**
 * Generates a pre-filled WhatsApp share URL for a Property with deep link
 */
export function getPropertyWhatsAppShareUrl(property: {
  id: string;
  title: string;
  propertyType: string;
  transactionType: string;
  locality: string;
  city?: string;
  askingPrice: number;
  builtUpAreaSqFt?: number;
  plotAreaSqFt?: number;
}): string {
  const baseUrl = getAppBaseUrl();
  const deepLink = `${baseUrl}?tab=properties&propertyId=${encodeURIComponent(property.id)}`;
  const area = property.builtUpAreaSqFt || property.plotAreaSqFt;
  const areaText = area ? `${area.toLocaleString('en-IN')} sq.ft` : 'N/A';

  const text = 
`🏡 *${property.title}*
📍 *Location:* ${property.locality}${property.city ? ', ' + property.city : ''}
🏷️ *Type:* ${property.propertyType} (${property.transactionType})
💰 *Asking Price:* ${formatINR(property.askingPrice)}
📐 *Area:* ${areaText}
🆔 *Property ID:* ${property.id}

🔗 *View & Collaborate on GENZ BROKER NETWORK:*
${deepLink}

_Powered by GENZ BUILDCON • Trusted Broker Exchange_`;

  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

/**
 * Generates a pre-filled WhatsApp share URL for a Buyer Requirement with deep link
 */
export function getRequirementWhatsAppShareUrl(req: {
  id: string;
  propertyType: string;
  transactionType: string;
  budgetMin: number;
  budgetMax: number;
  preferredLocalities: string[];
  urgency: string;
  minAreaSqFt?: number;
  maxAreaSqFt?: number;
}): string {
  const baseUrl = getAppBaseUrl();
  const deepLink = `${baseUrl}?tab=requirements&reqId=${encodeURIComponent(req.id)}`;
  const localities = req.preferredLocalities.join(', ');
  const areaText = req.minAreaSqFt
    ? `${req.minAreaSqFt.toLocaleString('en-IN')} - ${req.maxAreaSqFt?.toLocaleString('en-IN') || ''} sq.ft`
    : 'Flexible';

  const text =
`📋 *BUYER REQUIREMENT [${req.id}]*
🎯 *Category:* ${req.propertyType} (${req.transactionType})
📍 *Target Localities:* ${localities}
💵 *Budget Range:* ${formatINR(req.budgetMin)} - ${formatINR(req.budgetMax)}
📐 *Required Space:* ${areaText}
⏳ *Timeline:* ${req.urgency}

🤝 *Have matching inventory? Collaborate on GENZ BROKER NETWORK:*
${deepLink}

_Powered by GENZ BUILDCON • Verified Co-Broking_`;

  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}



/** v30 — print ONE document (an agreement, a form) in its own clean window; window.print() on the app page prints the whole screen */
export function printText(title: string, text: string): boolean {
  const esc = (x: string) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const w = window.open('', '_blank'); if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:16mm}body{margin:0;font-family:system-ui,"Noto Sans Devanagari","Mangal","Nirmala UI",sans-serif;color:#111}pre{white-space:pre-wrap;word-wrap:break-word;font-family:ui-monospace,Menlo,Consolas,"Noto Sans Devanagari",monospace;font-size:12px;line-height:1.55;margin:0}</style></head><body><pre>${esc(text)}</pre><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
  w.document.close(); return true;
}

/** v30 — print only the element with class `print-target` (the rest of the screen is hidden while printing) */
export function printTarget() {
  const done = () => { document.body.classList.remove('printing-target'); window.removeEventListener('afterprint', done); };
  document.body.classList.add('printing-target'); window.addEventListener('afterprint', done); window.print();
}
