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

/** YOUTUBE → embed (youtube-nocookie) · FILE → a <video> player · LINK → a button that opens the link (Drive etc.) */
export function videoKind(url: string): 'YOUTUBE' | 'FILE' | 'LINK' {
  if (youtubeId(url)) return 'YOUTUBE';
  if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url)) return 'FILE';
  return 'LINK';
}
