# v40 — Book a visit from Client Room / Deal Room, and share photos & video with the client

## 1. Visit booked from a Client Room
- **Where:** Client Rooms → open room → **Homes**: "Book a visit" on every available home. Each client visit request (Homes and the **Visits** tab) also has **"Book this visit"**, next to "Done".
- **The form:** the same "Schedule Verified Site Visit" form as everywhere else.
  - The client's name is filled in and locked. The time and note come from his request.
  - The broker types the client's **full mobile**. It must be the room's number (the room keeps only an HMAC and the last 4 digits; the label shows "ends with 1234").
- **Server checks** (`POST /api/site-visits` with `clientRoomId`, `clientRoomItemId`, `clientRoomRequestId`):
  - his own room, and the room is open;
  - the home is in the room;
  - the request belongs to that home;
  - the mobile matches the room's HMAC.
  - Error codes: `ROOM_PHONE_NEEDED` / `ROOM_PHONE_MISMATCH` (400), and 404 for another broker's room.
  - The usual rules (deal room auto-created, buyer bond, Network Watch, visit acknowledgement) still apply.
- **After booking:**
  - The request becomes HANDLED with the `visitId`.
  - The home records `visits[]` and the room timeline gets an event.
  - The client's page shows **"🗓 विज़िट तय: date/time"** on that home, but never the OTP or the code.

## 2. Deal Room
- **Schedule Visit** now fills in the deal's buyer (name, and mobile when this broker can see it unmasked — i.e. his own requirement).
- **New "Send to client room" button** (brokers): pick one of your open rooms. The home goes into it with its photos and video.

## 3. Photos & video for the client
- **When a home is shared**, the listing's photos and video go with it by default.
- **"Photos & video (x/y)"** opens a picker: tick photos (max 12) and videos (max 2). There are All and None buttons.
- **What can be shared** (`shareableMedia`):
  - the listing's own photos and video link;
  - the property vault's **PUBLIC** photos and walkthrough videos;
  - for the listing broker or owner only, also the vault's other photos and videos (his own listing).
  - **Never** papers (title deed, layout, tax), and never a vault item someone shared with this broker.
- **Re-checked on every view:** if the owner removes a photo or makes it private, it disappears from the room.
- **The client page shows:**
  - a swipeable gallery (tap a photo to open it full size);
  - a YouTube video embedded via youtube-nocookie;
  - a video file in a player;
  - any other link as a "Watch video" button.
- **API:**
  - `GET /api/client-rooms/:id/items/:itemId/media` — what can be shared, and what is chosen
  - `PUT /api/client-rooms/:id/items/:itemId/media` — `{photos, videos}`; anything outside the shareable set gives 400 `MEDIA_NOT_SHAREABLE`
  - `POST /api/client-rooms/:id/items` takes `withMedia` (default true)

## Files
- **New:** `src/shared/roomMedia.ts`, `src/components/ShareToRoom.tsx`
- **Changed:** `server/clientroom.ts`, `server.ts` (the site-visit route), `server/validation.ts`, `server/db.ts` (ClientRoom item `media`, `visits`, request `visitId`), `src/components/ClientRooms.tsx` (with a `MediaPicker`), `src/components/Modals.tsx` (ScheduleVisitModal `defaults` and `clientRoom`), `src/components/DealRoomsView.tsx`, `src/App.tsx`, `src/lib/api.ts`

## Tests
- `tests/v40-room-visit-media.test.ts` (4): link rules; co-broker vs listing broker media; foreign or confidential URL refused; another broker gets 404; the client OTP flow and visit request; booking checks (no phone, wrong phone, other broker, other home); request answered; the client sees the time but no code.
- Full suite: 840 passed.
- Browser check: picker, booking (wrong mobile refused, right one booked), "Visit booked" line, deal room "Send to client room", prefilled deal-room visit, and the client page (visit banner, video player).
