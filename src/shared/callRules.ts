/**
 * v81 — in-app voice calls (browser to browser, WebRTC). One place for the rules the server and the screens share.
 *
 * A call is only between two people who already work together inside GENZ — an employer and his own staff, the brokers of one
 * deal room, or a builder and his partner broker — so nobody ever types, sees or needs a phone number.
 *
 * Recording is never silent:
 *   · TEAM call (employer ↔ his own staff)  → the employer's own setting decides: OFF (no recording), ASK (the other side must
 *     allow it during the call) or ALWAYS (recorded from the first second, both screens show the red "recording" bar).
 *   · DEAL / PARTNER call (two different businesses) → always "ask": either side asks, the other must tap Allow. If the employer
 *     of a staff member on the call has set recording OFF, it cannot be asked for at all.
 * The audio is kept 30 days, then deleted. Staff never get the audio; their employer and the businesses on the call do.
 */

export type CallContext = 'TEAM' | 'DEAL' | 'PARTNER';
export const CALL_CONTEXTS: CallContext[] = ['TEAM', 'DEAL', 'PARTNER'];
export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED' | 'CANCELLED';
/** OFF = not recording, ASKED = one side has asked, ON = recording, DENIED = the other side said no */
export type RecordState = 'OFF' | 'ASKED' | 'ON' | 'DENIED';
export type RecordPolicy = 'OFF' | 'ASK' | 'ALWAYS';
export const RECORD_POLICIES: RecordPolicy[] = ['OFF', 'ASK', 'ALWAYS'];
export const DEFAULT_RECORD_POLICY: RecordPolicy = 'ASK';

export const RING_SECONDS = 45;
export const CALL_MAX_SECONDS = 60 * 60;
export const REC_KEEP_DAYS = 30;
/** one uploaded piece of the recording (the phone sends one about every minute — well under a serverless body limit) */
export const CHUNK_MAX_BYTES = 1_500_000;
/** a whole recording; a stored file stays under the 12 MB the database file-sync keeps */
export const REC_TOTAL_MAX_BYTES = 11_000_000;
export const REC_MAX_PARTS = 120;
/** how long after the call ends the recording phone may still send its last piece */
export const REC_GRACE_SECONDS = 180;
export const SIGNAL_MAX_BYTES = 12_000;
/** a person is asked to record at most this many times in one call */
export const REC_ASK_MAX = 3;

export type RecordMode = 'FORBIDDEN' | 'ASK' | 'ALWAYS';

/**
 * How recording works on one call.
 * @param context            where the call was started from
 * @param employerPolicy     the recording setting of the employer whose staff member is on the call (TEAM: the one employer; DEAL / PARTNER: the
 *                           staff member's employer) — undefined when no staff member is on the call
 * @param sameBusiness       every person on the call belongs to one business (an employer and his own people)
 */
export function recordMode(context: CallContext, employerPolicy: RecordPolicy | undefined, sameBusiness: boolean): RecordMode {
  if (employerPolicy === 'OFF') return 'FORBIDDEN';
  if (context === 'TEAM' && sameBusiness && employerPolicy === 'ALWAYS') return 'ALWAYS';
  return 'ASK';
}

export interface CallLike { status: CallStatus; createdAt: string; answeredAt?: string; endedAt?: string }

/** what the status should be now: a ring nobody answered is MISSED, a call that ran past the limit is ENDED */
export function lazyStatus(c: CallLike, nowMs: number): CallStatus {
  if (c.status === 'RINGING' && nowMs - Date.parse(c.createdAt) > RING_SECONDS * 1000) return 'MISSED';
  if (c.status === 'ACTIVE' && nowMs - Date.parse(c.answeredAt || c.createdAt) > (CALL_MAX_SECONDS + 120) * 1000) return 'ENDED';
  return c.status;
}
export const isLive = (s: CallStatus) => s === 'RINGING' || s === 'ACTIVE';

export function durationSec(c: CallLike): number {
  if (!c.answeredAt) return 0;
  const end = Date.parse(c.endedAt || '') || Date.parse(c.answeredAt);
  return Math.max(0, Math.min(CALL_MAX_SECONDS, Math.round((end - Date.parse(c.answeredAt)) / 1000)));
}
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec)); const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** the audio is still there (not deleted, not past the keeping days) */
export function recordingKept(recAt: string | undefined, nowMs: number): boolean {
  const t = Date.parse(recAt || ''); if (Number.isNaN(t)) return false;
  return nowMs - t < REC_KEEP_DAYS * 86_400_000;
}

/** audio container from the first bytes (the phone's recorder picks webm, mp4 or ogg) */
export function sniffAudio(b: Uint8Array): { ext: 'webm' | 'mp4' | 'ogg'; mime: string } | null {
  if (b.length < 12) return null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: 'webm', mime: 'audio/webm' };
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return { ext: 'mp4', mime: 'audio/mp4' };
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return { ext: 'ogg', mime: 'audio/ogg' };
  return null;
}
