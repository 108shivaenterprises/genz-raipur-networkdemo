/**
 * v40 — photos & video a broker shares with his client in a Client Room.
 * Only links are stored (the listing keeps photo / video links, the property vault keeps links too). Pure helpers used by the
 * server (what may be shared) and by the screens (how a video is shown).
 */
export const ROOM_MEDIA = { maxPhotos: 12, maxVideos: 2 } as const;

/** an https link (or a same-site path) — never javascript:, data: or http: */
export const okMediaUrl = (u: unknown): u is string =>
  typeof u === 'string' && u.length > 0 && u.length <= 500 && (/^https:\/\/[^\s"'<>]+$/i.test(u) || /^\/[^\s"'<>]*$/.test(u));

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else { const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/); id = m ? m[1] : ''; }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

/**
 * v104 — a photo / video uploaded in the app is stored at /api/owner-media/f/<id> (signed-in members only). A customer, a client-room visitor or a public page
 * has no login, so they read the same file at /m/<id> — open ONLY while a live listing uses it (server/ownermedia.ts). Every place that hands a media link to
 * someone without a login passes it through here.
 */
export const pubMediaUrl = (u: string): string => String(u).replace(/^\/api\/owner-media\/f\/((?:IMG|VID)-[0-9a-f]{12})$/, '/m/$1');
/** a video that was uploaded in the app (it has no .mp4 in its link) */
export const isUploadedVideo = (u: string): boolean => /^\/(?:api\/owner-media\/f|m)\/VID-[0-9a-f]{12}$/.test(String(u));

/** YOUTUBE → embed (youtube-nocookie) · FILE → a <video> player · LINK → a button that opens the link (Drive etc.) */
export function videoKind(url: string): 'YOUTUBE' | 'FILE' | 'LINK' {
  if (youtubeId(url)) return 'YOUTUBE';
  if (isUploadedVideo(url)) return 'FILE';
  if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url)) return 'FILE';
  return 'LINK';
}
