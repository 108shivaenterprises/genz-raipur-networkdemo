/** Feature switches (DECISIONS.md D1). Read at call time so a test or restart with the env changed takes effect. */
export const voiceOn = () => String(process.env.FEATURE_VOICE || '').toLowerCase() === 'true';

/** The one public base URL for links sent to people (SMS, QR, inlets). Production boot requires PUBLIC_URL; the Host-header fallback is for dev/demo only. */
export function publicBase(req: { protocol: string; get(h: string): string | undefined }): string {
  const fixed = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  if (process.env.NODE_ENV === 'production' && process.env.PUBLIC_DEMO !== 'true') return '';
  return `${req.protocol}://${req.get('host')}`;
}
