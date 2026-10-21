/**
 * Browser-side preparation of a property paper before upload: big phone photos are shrunk (so uploads stay quick on a mobile network),
 * PDFs are sent untouched. Returns the file name, size and the base64 body the server expects.
 */
import { PROP_DOC_MAX_BYTES, PROP_DOC_TYPES } from '../shared/propDocs.js';

export interface PreparedPaper { fileName: string; size: number; data: string; mime: string }

const readB64 = (blob: Blob) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^;]*;base64,/, ''));
  r.onerror = () => bad(new Error('read'));
  r.readAsDataURL(blob);
});

async function shrink(file: File, maxSide = 2400, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('img')); i.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('blob'))), 'image/jpeg', quality));
  } finally { URL.revokeObjectURL(url); }
}

/** Throws an Error whose message is already user-readable (en | hi). */
export async function preparePaper(file: File, lang: 'en' | 'hi' = 'en'): Promise<PreparedPaper> {
  const tooBig = lang === 'hi' ? 'फ़ाइल 10 MB से बड़ी है। छोटी / कम्प्रेस की हुई कॉपी भेजें।' : 'The file is larger than 10 MB. Send a smaller / compressed copy.';
  const isImg = /^image\/(jpeg|png|webp)$/.test(file.type);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isImg && !isPdf) throw new Error(lang === 'hi' ? 'सिर्फ़ PDF या फ़ोटो (JPEG / PNG / WebP) चलेंगे।' : 'Only PDF or photo (JPEG / PNG / WebP) files are accepted.');
  let blob: Blob = file; let fileName = file.name;
  if (isImg && file.size > 1.5 * 1024 * 1024) {
    try { blob = await shrink(file); fileName = file.name.replace(/\.[^.]+$/, '') + '.jpg'; } catch { /* keep the original */ }
  }
  if (blob.size > PROP_DOC_MAX_BYTES) throw new Error(tooBig);
  const data = await readB64(blob);
  return { fileName, size: blob.size, data, mime: blob.type || file.type };
}

/** "registry_plot14.pdf" → "registry plot14" */
export const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);

/** Best guess of the paper type from its file name (the user can change it). */
export function guessType(name: string): string {
  const n = name.toLowerCase();
  for (const t of PROP_DOC_TYPES) {
    if (t.id === 'OTHER') continue;
    const keys = t.words.split(/\s+/).filter(w => w.length >= 4);
    if (keys.some(k => n.includes(k.toLowerCase()))) return t.id;
  }
  return 'OTHER';
}

/** Other screens ("Papers" button on a property) call this, then open the Property Papers tab. */
export const PREFILL_KEY = 'genz_propdocs_prop';
export const openPapersFor = (propertyId: string) => { try { sessionStorage.setItem(PREFILL_KEY, propertyId); } catch { /* private mode */ } };

export const fmtSize = (b: number) => (b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
