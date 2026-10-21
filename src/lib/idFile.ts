/**
 * v19 — prepare a PAN / Aadhaar copy for upload: a phone photo (4–8 MB) is shrunk in the browser to a readable ~300 KB JPEG;
 * a PDF is sent as it is. Throws Error('TOO_BIG' | 'BAD_TYPE' | 'UNREADABLE') — the caller shows the words.
 */
import { ID_DOC_MAX_BYTES } from '../shared/idRules.js';

export interface PreparedIdFile { fileName: string; data: string; size: number }

const readDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result));
  fr.onerror = () => reject(new Error('UNREADABLE'));
  fr.readAsDataURL(b);
});

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error('UNREADABLE'));
  im.src = url;
});

const toJpeg = (im: HTMLImageElement, maxEdge: number, quality: number) => new Promise<Blob>((resolve, reject) => {
  const k = Math.min(1, maxEdge / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
  const g = c.getContext('2d'); if (!g) return reject(new Error('UNREADABLE'));
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
  c.toBlob(b => (b ? resolve(b) : reject(new Error('UNREADABLE'))), 'image/jpeg', quality);
});

export async function prepareIdFile(file: File): Promise<PreparedIdFile> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > ID_DOC_MAX_BYTES) throw new Error('TOO_BIG');
    return { fileName: file.name, data: await readDataUrl(file), size: file.size };
  }
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error('BAD_TYPE');
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImage(url);
    let blob = await toJpeg(im, 1800, 0.82);
    if (blob.size > ID_DOC_MAX_BYTES) blob = await toJpeg(im, 1400, 0.7);
    if (blob.size > ID_DOC_MAX_BYTES) throw new Error('TOO_BIG');
    return { fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg', data: await readDataUrl(blob), size: blob.size };
  } finally { URL.revokeObjectURL(url); }
}

/** the words for a prepare / upload failure, in the user's language */
export const idFileError = (e: any, hi: boolean): string => {
  const m = String(e?.message || '');
  if (m === 'TOO_BIG') return hi ? 'फ़ाइल बहुत बड़ी है (3 MB तक)। छोटा फ़ोटो / PDF चुनें।' : 'The file is too big (up to 3 MB). Choose a smaller photo / PDF.';
  if (m === 'BAD_TYPE') return hi ? 'सिर्फ़ फ़ोटो (JPEG / PNG / WebP) या PDF चलेगा।' : 'Only a photo (JPEG / PNG / WebP) or a PDF is accepted.';
  if (m === 'UNREADABLE') return hi ? 'यह फ़ाइल पढ़ी नहीं गई — दोबारा चुनें (iPhone की HEIC फ़ोटो हो तो JPEG में लें)।' : 'This file could not be read — choose it again (if it is an iPhone HEIC photo, take it as JPEG).';
  return m || (hi ? 'अपलोड नहीं हुआ' : 'Upload failed');
};
