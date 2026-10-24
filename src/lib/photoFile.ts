/**
 * v61 — a photo for the partner chat or a project notice: shrunk on the phone (longest side 1600 px, JPEG) so it goes quickly on a
 * mobile network and stays under the server's 600 KB. Returns the base64 body (no data: prefix) and a preview URL.
 */
export const PHOTO_MAX_BYTES = 600 * 1024;

export async function preparePhoto(file: File, hi = false): Promise<{ data: string; preview: string }> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error(hi ? 'सिर्फ़ फ़ोटो (JPEG / PNG / WebP) चलेगी।' : 'Only a photo (JPEG / PNG / WebP) can be sent.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('img')); i.src = url; });
    for (const [side, q] of [[1600, 0.8], [1200, 0.72], [900, 0.65]] as const) {
      const k = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', q);
      const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      if (b64.length * 0.75 <= PHOTO_MAX_BYTES) return { data: b64, preview: dataUrl };
    }
    throw new Error(hi ? 'फ़ोटो बहुत बड़ी है — छोटी फ़ोटो चुनें।' : 'The photo is too big — pick a smaller one.');
  } catch (e: any) {
    if (e?.message && e.message !== 'img') throw e;
    throw new Error(hi ? 'यह फ़ोटो पढ़ी नहीं गई — दूसरी चुनें।' : 'Could not read this photo — try another.');
  } finally { URL.revokeObjectURL(url); }
}
