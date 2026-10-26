/** v73 — shrink a phone photo in the browser (longest side ≤ maxSide, JPEG) until it is under maxBytes. Returns a data URL. */
export async function shrinkImage(file: File, maxSide = 1280, maxBytes = 400 * 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img: HTMLImageElement = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('bad image')); i.src = url; });
    let side = maxSide;
    for (let round = 0; round < 5; round++) {
      const k = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.78, 0.65, 0.5]) { const d = c.toDataURL('image/jpeg', q); if (d.length * 0.75 <= maxBytes) return d; }
      side = Math.round(side * 0.75);
    }
    throw new Error('too big');
  } finally { URL.revokeObjectURL(url); }
}
/** a paper: a photo is shrunk, a PDF is sent as is when small enough */
export async function prepareDoc(file: File, maxBytes = 1400 * 1024): Promise<string> {
  if (file.type === 'application/pdf') {
    if (file.size > maxBytes) throw new Error('PDF too big');
    return await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('read')); r.readAsDataURL(file); });
  }
  return shrinkImage(file, 1800, maxBytes);
}
export const readAsDataUrl = (file: File): Promise<string> => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('read')); r.readAsDataURL(file); });
