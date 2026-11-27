import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

describe('v198 · non-matching requirement share capability', () => {
  it('MatchCenterView contains share options alongside why explanation', () => {
    const src = readFileSync(path.join(ROOT, 'src/components/MatchCenterView.tsx'), 'utf8');
    // Ensure why explanation testid is kept
    expect(src).toContain('match-share-why');
    // Ensure match-share button exists
    expect(src).toContain('match-share');
    // Ensure ShareToRoom is embedded for sharing to other client rooms
    expect(src).toContain('ShareToRoom propertyId={home.id}');
    // Ensure WhatsApp share link with verified public poster URL is present
    expect(src).toContain('getPropertyWhatsAppShareUrl(home)');
    expect(src).toContain('title={tx(\'Share on WhatsApp\', \'WhatsApp पर भेजें\')}');
  });

  it('api.spOffer supports force flag to share homes even when not matching criteria', () => {
    const apiSrc = readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8');
    expect(apiSrc).toContain('spOffer: (id: string, homeId: string, force?: boolean)');
    expect(apiSrc).toContain('...(force ? { force: true } : {})');
  });

  it('server shopPartners allows forced sharing of active network homes to leads', () => {
    const serverSrc = readFileSync(path.join(ROOT, 'server/shopPartners.ts'), 'utf8');
    expect(serverSrc).toContain('req.body?.force || req.body?.allowAny');
    expect(serverSrc).toContain('addRoomHomes(l.brokerId, roomId, [h.id])');
  });
});
