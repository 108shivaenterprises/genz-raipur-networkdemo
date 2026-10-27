/**
 * v78 — how a project paper is shown to a CLIENT on the public page (/s/:token), with the name of the person who sent the link
 * stamped across it. Pure rules (no server imports) so the page and the tests use exactly the same code.
 *
 * Honest limit: a paper that is only a link (Drive, a builder's website) is shown inside the page with the stamp laid over it.
 * A screenshot or a photo of that screen carries the name of whoever sent the link — that is what makes a leaked copy traceable.
 * The stamp is not part of the file itself, so someone who opens the original link directly sees the file without it.
 */
export type Embed = { mode: 'image' | 'frame'; src: string };

const IMG = /\.(?:jpe?g|png|webp|gif|avif)$/i;

/** the way to show this link on the page, or null when it is not a plain web link */
export function embedFor(raw: unknown): Embed | null {
  let u: URL;
  try { u = new URL(String(raw ?? '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  const href = u.toString();
  if (IMG.test(u.pathname)) return { mode: 'image', src: href };
  if (host === 'drive.google.com') {
    const m = u.pathname.match(/^\/file\/d\/([\w-]{10,})/) || (u.pathname === '/open' || u.pathname === '/uc' ? ['', u.searchParams.get('id') || ''] : null);
    const id = m && /^[\w-]{10,}$/.test(m[1] || '') ? m[1] : '';
    if (id) return { mode: 'frame', src: `https://drive.google.com/file/d/${id}/preview` };
  }
  if (host === 'docs.google.com') {
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]{10,})/);
    if (m) return { mode: 'frame', src: `https://docs.google.com/${m[1]}/d/${m[2]}/preview` };
  }
  return { mode: 'frame', src: href };
}

const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const clip = (s: string, n: number) => { const a = Array.from(s); return a.length > n ? a.slice(0, n - 1).join('') + '…' : s; };

/** the name that is stamped: the person who sent the link (an employee's link also names the firm) */
export function stampName(sender: { name?: string; role?: string }, firm?: string): string {
  const n = clip(String(sender.name || '').replace(/\s+/g, ' ').trim(), 40) || 'GENZ';
  const f = clip(String(firm || '').replace(/\s+/g, ' ').trim(), 32);
  return sender.role === 'TEAM_MEMBER' && f && f !== n ? `${n} · ${f}` : n;
}

/** a repeating, slanted, two-tone (light edge + dark red) tile so it shows on white paper and on dark photos alike — as a CSS-safe data URI.
 *  The tile is sized to the name, so the name is never cut at the edge of a tile (a long name gets a wider, taller tile). */
export function watermarkTile(text: string): string {
  const raw = clip(text, 60); const line = xml(raw);
  const est = Array.from(raw).length * 10.5;                              // about the width of the 17px bold line
  const w = Math.round(Math.max(260, est + 90)); const h = Math.round(Math.max(150, est * 0.41 + 70));
  const x = w / 2; const y = h / 2 + 6;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<g transform="rotate(-24 ${x} ${h / 2})" font-family="system-ui,'Noto Sans Devanagari',sans-serif" font-size="17" font-weight="700" text-anchor="middle">`
    + `<text x="${x}" y="${y}" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="4" stroke-linejoin="round">${line}</text><text x="${x}" y="${y}" fill="#b91c1c" fill-opacity=".34">${line}</text>`
    + `</g></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/** "R.D." — large and faint in the middle, so even a cropped photo of the screen shows whose link it was */
export function stampInitials(name: string): string {
  return String(name || '').split(/\s+/).filter(w => /^[A-Za-zऀ-ॿ]/.test(w)).slice(0, 3).map(w => Array.from(w)[0].toUpperCase() + '.').join('');
}
