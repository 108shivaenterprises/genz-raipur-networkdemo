import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

describe('v200 · In-App Client Account Rooms & Live Notifications', () => {
  it('mounts /api/my-client-rooms in server.ts and exports createBuyerClientRoomRouter', () => {
    const srv = readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
    expect(srv).toContain("app.use('/api/my-client-rooms', createBuyerClientRoomRouter())");

    const cr = readFileSync(path.join(ROOT, 'server/clientroom.ts'), 'utf8');
    expect(cr).toContain('export function createBuyerClientRoomRouter()');
    expect(cr).toContain('matchingClientUserIds(room)');
    expect(cr).toContain("alertUsers(uids, 'deals'");
  });

  it('provides myClientRooms, replyMyClientRoom, and reactMyClientRoom in api.ts', () => {
    const api = readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8');
    expect(api).toContain("myClientRooms: () => request<{ success: boolean; rooms: any[] }>('/api/my-client-rooms')");
    expect(api).toContain('replyMyClientRoom');
    expect(api).toContain('reactMyClientRoom');
  });

  it('renders BuyerClientRooms inside HomeInsights for BUYER_TENANT', () => {
    const compPath = path.join(ROOT, 'src/components/BuyerClientRooms.tsx');
    expect(existsSync(compPath)).toBe(true);
    const comp = readFileSync(compPath, 'utf8');
    expect(comp).toContain('data-testid="buyer-client-rooms"');
    expect(comp).toContain('My Broker Rooms & Live Updates');

    const hi = readFileSync(path.join(ROOT, 'src/components/HomeInsights.tsx'), 'utf8');
    expect(hi).toContain("import { BuyerClientRooms } from './BuyerClientRooms.js'");
    expect(hi).toContain('<BuyerClientRooms />');
  });
});
